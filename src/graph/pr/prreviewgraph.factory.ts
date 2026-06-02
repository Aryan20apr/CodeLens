import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { DiffChunkerService } from '../../diff/diff-chunker.service';
import { DiffParserService } from '../../diff/diff-parser.service';
import { GithubApiService } from '../../github/github-api.service';
import { PrFileEnrichmentService } from '../../review/enrichment/pr-file-enrichment.service';
import { PrAnalyzeAgentFactory } from './analyze/analyze-agent.factory';
import { PrReviewPromptService } from '../../review/pr-review-prompt.service';
import { PrReviewProgressPublisher } from '../../streaming/pr-review-progress-publisher.service';
import { createAnalyzeNode } from './nodes/analyze.node';
import { createChunkNode } from './nodes/chunk.node';
import { createDiffIngestionNode } from './nodes/diff-ingestion.node';
import { createEnrichFilesNode } from './nodes/enrich-files.node';
import { createPostReviewNode } from './nodes/post-review.node';
import type {
  PrReviewGraphInvokeInput,
  PrReviewGraphInvokeResult,
} from './pr-review-graph.types';
import {
  PrReviewGraphState,
  prReviewMemoryCheckpointer,
} from './pr-review.state.annotation';

@Injectable()
export class PrReviewGraphFactory implements OnModuleInit {
  private readonly logger: Logger;
  private compiled: ReturnType<PrReviewGraphFactory['build']> | null = null;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly github: GithubApiService,
    private readonly diffParser: DiffParserService,
    private readonly chunker: DiffChunkerService,
    private readonly promptService: PrReviewPromptService,
    private readonly analyzeAgent: PrAnalyzeAgentFactory,
    private readonly enrichment: PrFileEnrichmentService,
    private readonly progress: PrReviewProgressPublisher,
  ) {
    this.logger = logger.child({ context: PrReviewGraphFactory.name });
  }

  onModuleInit() {
    this.compiled = this.build();
    this.logger.info(
      'LangGraph (pr-review) compiled: START -> ingestDiff -> chunk -> enrichFiles -> analyze -> postReview -> END',
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

    this.logger.info(`[${className}] [${methodName}] :: Invoking PR review graph`, {
      reviewRunId,
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
    });

    const graph = this.getCompiledGraph();

    const initialState = {
      reviewRunId,
      installationId: input.installationId,
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
      headSha: input.headSha,
      baseSha: input.baseSha,
      prTitle: null,
      prBody: null,
      diffText: null,
      diffTruncated: false,
      apiFileIndex: undefined,
      parsed: null,
      chunks: [],
      fileIndex: [],
      crossFileHints: [],
      removedOnlyFileCount: 0,
      binaryOrEmptyFileCount: 0,
      fileContexts: [],
      summaryMarkdown: null,
      githubReviewId: null,
      status: 'pending' as const,
      error: null,
      events: [],
    } satisfies typeof PrReviewGraphState.State;

    const result = await graph.invoke(initialState, {
      configurable: { thread_id: reviewRunId },
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
    if (!result.summaryMarkdown || !result.githubReviewId) {
      throw new Error('PR review graph finished without summary or githubReviewId');
    }

    this.logger.info(`[${className}] [${methodName}] :: PR review graph completed`, {
      reviewRunId,
      githubReviewId: result.githubReviewId,
      eventCount: result.events.length,
    });

    return {
      summaryMarkdown: result.summaryMarkdown,
      githubReviewId: result.githubReviewId,
      events: result.events,
    };
  }

  private build() {
    const ingestDiff = createDiffIngestionNode(this.github, this.progress);
    const chunk = createChunkNode(this.diffParser, this.chunker, this.progress);
    const enrichFiles = createEnrichFilesNode(this.enrichment, this.progress);
    const analyze = createAnalyzeNode(
      this.promptService,
      this.analyzeAgent,
      this.progress,
    );
    const postReview = createPostReviewNode(this.github, this.progress);

    return new StateGraph(PrReviewGraphState)
      .addNode('ingestDiff', ingestDiff)
      .addNode('chunk', chunk)
      .addNode('enrichFiles', enrichFiles)
      .addNode('analyze', analyze)
      .addNode('postReview', postReview)
      .addEdge(START, 'ingestDiff')
      .addEdge('ingestDiff', 'chunk')
      .addEdge('chunk', 'enrichFiles')
      .addEdge('enrichFiles', 'analyze')
      .addEdge('analyze', 'postReview')
      .addEdge('postReview', END)
      .compile({ checkpointer: prReviewMemoryCheckpointer });
  }
}