import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DiffModule } from '../diff/diff.module';
import { GithubApiService } from '../github/github-api.service';
import { LlmModule } from '../llm/llm.module';
import { LoggerModule } from '../logger/logger.module';
import { PrFileEnrichmentService } from '../review/enrichment/pr-file-enrichment.service';
import { GLOBAL_SEARCH_PROVIDER } from '../review/context/global-search-provider.interface';
import { PrSearchToolExecutorService } from '../review/context/pr-search-tool-executor.service';
import { PrReviewPromptService } from '../review/pr-review-prompt.service';
import { PrReviewProgressPublisher } from '../streaming/pr-review-progress-publisher.service';
import { AutonomousReviewAgentFactory } from '../review/autonomous-review-agent.factory';
import { DiffChunkSerializerService } from '../diff/diff-chunk-serializer.service';
import { PrReviewGraphFactory } from './pr/prreviewgraph.factory';
import { AstExtractService } from './lib/ast-extract.service';
import { LanguageDetectService } from './lib/language-detect.service';
import { QueryLoaderService } from './lib/queries/query-loader.service';
import { TreeSitterService } from './lib/tree-sitter/tree-sitter.service';
import { AgentPromptService } from '../review/agent-prompt.service';
import { ValidatePrFindingsService } from '../review/findings/validator.service';
import { PromptModule } from '../prompts/prompt.module';
import { MemorySaver } from '@langchain/langgraph';
import { LangGraphCheckpointerService } from './checkpointer/langgraph-checkpointer.service';
import { PostedFindingRepository } from '../db/github/posted-finding.repository';
import { GraphFactory } from './graph.factory';

const noopProgressPublisher: Pick<
  PrReviewProgressPublisher,
  'stepStarted' | 'stepCompleted' | 'stepFailed' | 'done'
> = {
  stepStarted: async () => undefined,
  stepCompleted: async () => undefined,
  stepFailed: async () => undefined,
  done: async () => undefined,
};

const noopSearchProvider = {
  searchSymbolUsage: async () => ({ paths: [], snippets: [] }),
  searchImportTarget: async () => ({ paths: [], snippets: [] }),
};

/** Minimal Nest module for exporting LangGraph Mermaid (no Redis / Prisma / GitHub). */
@Module({
  imports: [AppConfigModule, LoggerModule, LlmModule, DiffModule, PromptModule],
  providers: [
    GraphFactory,
    AutonomousReviewAgentFactory,
    DiffChunkSerializerService,
    PrReviewGraphFactory,
    TreeSitterService,
    QueryLoaderService,
    AstExtractService,
    LanguageDetectService,
    PrFileEnrichmentService,
    PrReviewPromptService,
    AgentPromptService,
    ValidatePrFindingsService,
    PrSearchToolExecutorService,
    {
      provide: PrReviewProgressPublisher,
      useValue: noopProgressPublisher,
    },
    {
      provide: GithubApiService,
      useValue: {},
    },
    {
      provide: GLOBAL_SEARCH_PROVIDER,
      useValue: noopSearchProvider,
    },
    {
      provide: LangGraphCheckpointerService,
      useValue: { getSaver: () => new MemorySaver() },
    },
    {
      provide: PostedFindingRepository,
      useValue: {
        findFingerprints: async () => new Set(),
        insertMany: async () => {},
      },
    },
  ],
  exports: [GraphFactory, PrReviewGraphFactory],
})
export class GraphMermaidExportModule {}
