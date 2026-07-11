import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { DiffChunkerService } from '../../diff/diff-chunker.service';
import { DiffParserService } from '../../diff/diff-parser.service';
import { PostedFindingRepository } from '../../db/github/posted-finding.repository';
import { GithubApiService } from '../../github/github-api.service';
import { PrFileEnrichmentService } from '../../review/enrichment/pr-file-enrichment.service';
import { PrAnalyzeAgentFactory } from './analyze/analyze-agent.factory';
import { PrReviewPromptService } from '../../review/pr-review-prompt.service';
import { AgentPromptService } from '../../review/agent-prompt.service';
import { PrReviewProgressPublisher } from '../../streaming/pr-review-progress-publisher.service';
import { createSpecializedAgentNode } from './nodes/specialized-agent.node';
import { createAggregateFindingsNode } from './nodes/aggregate-findings.node';
import { createChunkNode } from './nodes/chunk.node';
import { createDiffIngestionNode } from './nodes/diff-ingestion.node';
import { createEnrichFilesNode } from './nodes/enrich-files.node';
import { createPostReviewNode } from './nodes/post-review.node';
import type { AppConfig } from '../../config/app-config.types';
import { APP_CONFIG } from '../../config/config.constants';
import { ValidatePrFindingsService } from '../../review/findings/validator.service';
import { createValidateFindingsNode } from './nodes/validate-findings.node';
import { LlmService } from '../../llm/llm.service';
import { createTriageAnalysisNode, routeAfterTriage } from './nodes/triage-analysis.node';
import { createSimpleAnalyzeNode } from './nodes/simple-analyze.node';
import type {
  PrReviewGraphInvokeInput,
  PrReviewGraphInvokeResult,
} from './pr-review-graph.types';
import { PrReviewGraphState } from './pr-review.state.annotation';
import { LangGraphCheckpointerService } from '../checkpointer/langgraph-checkpointer.service';

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
    private readonly promptService: PrReviewPromptService,
    private readonly agentPromptService: AgentPromptService,
    private readonly analyzeAgent: PrAnalyzeAgentFactory,
    private readonly enrichment: PrFileEnrichmentService,
    private readonly progress: PrReviewProgressPublisher,
    private readonly llm: LlmService,
    private readonly findingsValidator: ValidatePrFindingsService,
    private readonly checkpointerService: LangGraphCheckpointerService,
    private readonly postedFindings: PostedFindingRepository,
  ) {
    this.logger = logger.child({ context: PrReviewGraphFactory.name });
  }

  onModuleInit() {
    this.compiled = this.build();
    this.logger.info(
      'LangGraph (pr-review) compiled: START -> ingestDiff -> chunk -> enrichFiles -> triageAnalysis -> {simpleAnalyze | [securityAgent ‖ perfAgent ‖ bpAgent]} -> aggregateFindings -> validateFindings -> postReview -> END',
    );
  }

  getCompiledGraph() {
    if (!this.compiled) this.compiled = this.build();
    return this.compiled;
  }

  async invokePrReview(
    input: PrReviewGraphInvokeInput,
  ): Promise<PrReviewGraphInvokeResult> {
    const className = PrReviewGraphFactory.name;
    const methodName = 'invokePrReview';
    const { reviewRunId } = input;

    const checkpointConfig = { configurable: { thread_id: reviewRunId } };
    const existing = await this.checkpointerService
      .getSaver()
      .getTuple(checkpointConfig);

    this.logger.info(`[${className}] [${methodName}] :: Invoking PR review graph`, {
      reviewRunId,
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
      resuming: existing != null,
    });

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
          reviewMode: input.reviewMode,
          priorHeadSha: input.priorHeadSha ?? null,
          parentRunId: input.parentRunId ?? null,
          prTitle: null,
          prBody: null,
          diffText: null,
          diffTruncated: false,
          completeFileIndex: undefined,
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
          summaryMarkdown: null,
          githubReviewId: null,
          status: 'pending' as const,
          error: null,
          events: [],
        } satisfies typeof PrReviewGraphState.State);

    const result = await graph.invoke(invokeInput, {
      ...checkpointConfig,
      runName: 'pr-review-graph',
      tags: ['pr-review'],
      metadata: {
        reviewRunId,
        repoFullName: input.repoFullName,
        prNumber: input.prNumber,
        headSha: input.headSha,
      },
    });

    if (result.status === 'failed' || result.error) {
      throw new Error(result.error ?? 'PR review graph failed');
    }
    if (!result.analysisSummary?.trim() || !result.summaryMarkdown?.trim()) {
      throw new Error('PR review graph finished without analysis summary');
    }
    if (!result.githubReviewId) {
      throw new Error('PR review graph finished without githubReviewId');
    }

    this.logger.info(`[${className}] [${methodName}] :: PR review graph completed`, {
      reviewRunId,
      githubReviewId: result.githubReviewId,
      agentFindingCount: result.agentFindings.length,
      validatedFindingCount: result.validatedFindings.length,
      eventCount: result.events.length,
    });

    return {
      summaryMarkdown: result.summaryMarkdown,
      githubReviewId: result.githubReviewId,
      events: result.events,
    };
  }

  private build() {
    const checkpointer = this.checkpointerService.getSaver();

    const ingestDiff = createDiffIngestionNode(this.github, this.progress);
    const chunk = createChunkNode(this.diffParser, this.chunker, this.progress);
    const enrichFiles = createEnrichFilesNode(this.enrichment, this.progress);

    const triageAnalysis = createTriageAnalysisNode(this.llm, this.progress);
    const simpleAnalyze = createSimpleAnalyzeNode(
      this.promptService,
      this.analyzeAgent,
      this.progress,
    );

    const securityAgent = createSpecializedAgentNode(
      'security',
      this.agentPromptService,
      this.promptService,
      this.analyzeAgent,
      this.progress,
    );
    const perfAgent = createSpecializedAgentNode(
      'performance',
      this.agentPromptService,
      this.promptService,
      this.analyzeAgent,
      this.progress,
    );
    const bpAgent = createSpecializedAgentNode(
      'best_practices',
      this.agentPromptService,
      this.promptService,
      this.analyzeAgent,
      this.progress,
    );

    const aggregateFindings = createAggregateFindingsNode(
      this.progress,
      this.appConfig.prReview.findings.mergeSimilarityThreshold,
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
      .addNode('triageAnalysis', triageAnalysis)
      .addNode('simpleAnalyze', simpleAnalyze)
      .addNode('securityAgent', securityAgent)
      .addNode('perfAgent', perfAgent)
      .addNode('bpAgent', bpAgent)
      .addNode('aggregateFindings', aggregateFindings)
      .addNode('validateFindings', validateFindings)
      .addNode('postReview', postReview)
      .addEdge(START, 'ingestDiff')
      .addEdge('ingestDiff', 'chunk')
      .addEdge('chunk', 'enrichFiles')
      .addEdge('enrichFiles', 'triageAnalysis')
      // Dynamic Send-based fan-out: routeAfterTriage returns Send[] for only
      // the agents triage selected. The path-hint array tells LangGraph which
      // nodes are reachable (for diagram generation); it has no effect at runtime.
      .addConditionalEdges('triageAnalysis', routeAfterTriage, [
        'simpleAnalyze',
        'securityAgent',
        'perfAgent',
        'bpAgent',
      ])
      // Fan-in edges: each agent points to aggregateFindings. With Send, only
      // the dispatched agents actually run — the others' edges are never traversed.
      .addEdge('simpleAnalyze', 'aggregateFindings')
      .addEdge('securityAgent', 'aggregateFindings')
      .addEdge('perfAgent', 'aggregateFindings')
      .addEdge('bpAgent', 'aggregateFindings')
      .addEdge('aggregateFindings', 'validateFindings')
      .addEdge('validateFindings', 'postReview')
      .addEdge('postReview', END)
      .compile({ checkpointer });
  }
}
