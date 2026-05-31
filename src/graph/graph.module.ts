import { Module } from '@nestjs/common';
import { QueryLoaderService } from './lib/queries/query-loader.service';
import { TreeSitterService } from './lib/tree-sitter/tree-sitter.service';
import { AstExtractService } from './lib/ast-extract.service';
import { AppConfigModule } from 'src/config/config.module';
import { LlmModule } from 'src/llm/llm.module';
import { GraphFactory } from './graph.factory';
import { LanguageDetectService } from './lib/language-detect.service';
import { DiffModule } from 'src/diff/diff.module';
import { ReviewModule } from 'src/review/review.module';
import { StreamingModule } from 'src/streaming/streaming.module';
import { PrFileEnrichmentService } from '../review/enrichment/pr-file-enrichment.service';
import { PrReviewGraphFactory } from './pr/prreviewgraph.factory';

@Module({
  imports: [
    AppConfigModule,
    LlmModule,
    DiffModule,
    ReviewModule,
    StreamingModule,
  ],
  providers: [
    GraphFactory,
    PrReviewGraphFactory,
    TreeSitterService,
    QueryLoaderService,
    AstExtractService,
    LanguageDetectService,
    PrFileEnrichmentService,
  ],
  exports: [GraphFactory, PrReviewGraphFactory],
})
export class GraphModule {}
