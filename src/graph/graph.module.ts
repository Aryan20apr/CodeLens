import { Module } from '@nestjs/common';
import { QueryLoaderService } from './lib/queries/query-loader.service';
import { TreeSitterService } from './lib/tree-sitter/tree-sitter.service';
import { AstExtractService } from './lib/ast-extract.service';
import { AppConfigModule } from 'src/config/config.module';
import { LlmModule } from 'src/llm/llm.module';
import { GraphFactory } from './graph.factory';
import { LanguageDetectService } from './lib/language-detect.service';

@Module({
  imports: [AppConfigModule, LlmModule],
  providers: [
    GraphFactory,
    TreeSitterService,
    QueryLoaderService,
    AstExtractService,
    LanguageDetectService,
  ],
  exports: [GraphFactory],
})
export class GraphModule {}
