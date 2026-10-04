import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { DiffChunkerService } from '../../diff/diff-chunker.service';
import { DiffParserService } from '../../diff/diff-parser.service';
import { DiffChunkSerializerService } from '../../diff/diff-chunk-serializer.service';
import { GithubApiService } from '../../github/github-api.service';
import { PrFileEnrichmentService } from '../../review/enrichment/pr-file-enrichment.service';
import { AutonomousReviewAgentFactory } from '../../review/autonomous-review-agent.factory';
import { PrReviewProgressPublisher } from '../../streaming/pr-review-progress-publisher.service';
import { createChunkNode } from './nodes/chunk.node';
import { createDiffIngestionNode } from './nodes/diff-ingestion.node';
import { createEnrichFilesNode } from './nodes/enrich-files.node';
import { createAutonomousReviewNode } from './nodes/autonomous-review.node';
import { createPostReviewNode } from './nodes/post-review.node';
import type { AppConfig } from '../../config/app-config.types';
import { APP_CONFIG } from '../../config/config.constants';
import { ValidatePrFindingsService } from '../../review/findings/validator.service';
import { createValidateFindingsNode } from './nodes/validate-findings.node';
import type {
  PrReviewGraphInvokeInput,
  PrReviewGraphInvokeResult,
} from './pr-review-graph.types';
import { PrReviewGraphState } from './pr-review.state.annotation';
import { PostedFindingRepository } from '../../db/github/posted-finding.repository';
import { LangGraphCheckpointerService } from '../checkpointer/langgraph-checkpointer.service';
import type { UserLlmKey } from '../../llm-provider/llm-provider.service';
import { LlmService } from '../../llm/llm.service';

@Injectable()
export class PrReviewGraphFactory implements OnModuleInit {
  private readonly logger: Logger;
  private compiled: ReturnType<PrReviewGraphFactory['build']> | null = null;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly github: GithubApiService,
    private readonly diffParser: DiffParserService,
    private readonly chunker: DiffChunkerService,
    private readonly diffSerializer: DiffChunkSerializerService,
    private readonly autonomousAgentFactory: AutonomousReviewAgentFactory,
    private readonly enrichment: PrFileEnrichmentService,
    private readonly progress: PrReviewProgressPublisher,
    private readonly findingsValidator: ValidatePrFindingsService,
    private readonly checkpointerService: LangGraphCheckpointerService,
    private readonly postedFindings: PostedFindingRepository,
    private readonly llm: LlmService,
  ) {
    this.logger = logger.child({ context: PrReviewGraphFactory.name });
  }

  onModuleInit() {
    this.compiled = this.build();
    this.logger.info(
      'LangGraph (pr-review) compiled: START -> ingestDiff -> chunk -> enrichFiles -> autonomousReview -> validateFindings -> postReview -> END',
    );
  }

  getCompiledGraph() {
    if (!this.compiled) this.compiled = this.build();
    return this.compiled;
  }

  async invokePrReview(
    input: PrReviewGraphInvokeInput,
    config?: { userLlmKey?: UserLlmKey },
  ): Promise<PrReviewGraphInvokeResult> {
    const className = PrReviewGraphFactory.name;
    const methodName = 'invokePrReview';
    const { reviewRunId } = input;

    const checkpointConfig = { configurable: { thread_id: reviewRunId } };
    const existing = await this.checkpointerService
      .getSaver()
      .getTuple(checkpointConfig);

    this.logger.info(
      `[${className}] [${methodName}] :: Invoking PR review graph`,
      {
        reviewRunId,
        repoFullName: input.repoFullName,
        prNumber: input.prNumber,
        resuming: existing != null,
      },
    );

    const graph = this.getCompiledGraph();

    // On first attempt (no checkpoint) supply the full initial state so
    // LangGraph starts a fresh run. On retries, pass null so LangGraph
    // loads the saved checkpoint and resumes from the last failed node,
    // avoiding redundant token spend on already-completed nodes.
    const invokeInput = existing
      ? null
      : ({
          reviewRunId,
          installationId: input.installationId,
          repoFullName: input.repoFullName,
          prNumber: input.prNumber,
          headSha: input.headSha,
          baseSha: input.baseSha,
          previousReview: input.previousReview ?? null,
          isIncrementalReview: input.isIncrementalReview ?? false,
          prTitle: null,
          prBody: null,
          diffText: null,
          diffTruncated: false,
          apiFileIndex: undefined,
          parsed: null,
          chunks: [],
          fileIndex: [],
          crossFileHints: [],
          analysisRoute: null,
          selectedAgents: [],
          agentFindings: [],
          agentSummaries: [],
          rawFindings: [],
          analysisSummary: null,
          validatedFindings: [],
          validationStats: null,
          removedOnlyFileCount: 0,
          binaryOrEmptyFileCount: 0,
          fileContexts: [],
          repoRules: null,
          repoSkills: [],
          summaryMarkdown: null,
          githubReviewId: null,
          status: 'pending' as const,
          error: null,
          events: [],
        } satisfies typeof PrReviewGraphState.State);

    const result = await graph.invoke(invokeInput, {
      ...checkpointConfig,
      configurable: {
        ...checkpointConfig.configurable,
        userLlmKey: config?.userLlmKey,
      },
      runName: 'pr-review-graph',
      tags: ['pr-review'],
      metadata: {
        reviewRunId,
        repoFullName: input.repoFullName,
        prNumber: input.prNumber,
        headSha: input.headSha,
      },
    });

    const terminalStatus =
      result.status === 'complete' || result.status === 'failed'
        ? result.status
        : 'complete';

    this.logger.info(
      `[${className}] [${methodName}] :: PR review graph invocation finished`,
      {
        reviewRunId,
        status: terminalStatus,
        rawCount: result.rawFindings?.length ?? 0,
        validatedCount: result.validatedFindings?.length ?? 0,
        hasSummary: !!result.summaryMarkdown,
        githubReviewId: result.githubReviewId,
      },
    );

    return {
      summaryMarkdown: result.summaryMarkdown ?? '',
      githubReviewId: result.githubReviewId ?? '',
      events: result.events ?? [],
      validatedFindings: result.validatedFindings ?? [],
    };
  }

  private build() {
    const checkpointer = this.checkpointerService.getSaver();

    const ingestDiff = createDiffIngestionNode(this.github, this.progress);
    const chunk = createChunkNode(this.diffParser, this.chunker, this.progress);
    const enrichFiles = createEnrichFilesNode(this.enrichment, this.progress);
    const autonomousReview = createAutonomousReviewNode(
      this.autonomousAgentFactory,
      this.diffSerializer,
      this.progress,
      this.llm,
    );
    const validateFindings = createValidateFindingsNode(
      this.findingsValidator,
      this.progress,
    );
    const postReview = createPostReviewNode(
      this.github,
      this.progress,
      this.postedFindings,
      this.appConfig.prReview.findings.maxCommentBodyChars,
    );

    return new StateGraph(PrReviewGraphState)
      .addNode('ingestDiff', ingestDiff)
      .addNode('chunk', chunk)
      .addNode('enrichFiles', enrichFiles)
      .addNode('autonomousReview', autonomousReview)
      .addNode('validateFindings', validateFindings)
      .addNode('postReview', postReview)
      .addEdge(START, 'ingestDiff')
      .addEdge('ingestDiff', 'chunk')
      .addEdge('chunk', 'enrichFiles')
      .addEdge('enrichFiles', 'autonomousReview')
      .addEdge('autonomousReview', 'validateFindings')
      .addEdge('validateFindings', 'postReview')
      .addEdge('postReview', END)
      .compile({ checkpointer });
  }
}
