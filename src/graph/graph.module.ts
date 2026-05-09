import { Module } from '@nestjs/common';
import { QueryLoaderService } from './lib/queries/query-loader.service';
import { TreeSitterService } from './lib/tree-sitter/tree-sitter.service';
import { AstExtractService } from './lib/ast-extract.service';

@Module({
    providers: [TreeSitterService, QueryLoaderService, AstExtractService],
    exports: [AstExtractService],
})
export class GraphModule {}
