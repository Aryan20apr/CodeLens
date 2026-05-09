import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Logger } from "winston";
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { StateGraph, START, END } from "@langchain/langgraph";
import { LanguageDetectService } from './lib/language-detect.service';
import { AstExtractService } from './lib/ast-extract.service';
import { createParseNode } from './nodes/parse.node';
import { SnippetGraphState, snippetMemoryCheckpointer } from './state.annotation';


@Injectable()
export class GraphFactory implements OnModuleInit {

    private readonly logger: Logger;
    private compiled: ReturnType<GraphFactory['build']> | null = null;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
        private readonly language: LanguageDetectService,
        private readonly ast: AstExtractService
    ){
        this.logger = logger.child({context: GraphFactory.name})
    }


    onModuleInit() {
        this.compiled = this.build();
        this.logger.info('LangGraph (snippet) compiled: START -> parse -> END');
    }

    getCompiledGraph(): ReturnType<GraphFactory['build']>{
        if(!this.compiled){
            this.compiled = this.build();
        }
        return this.compiled;
    }

    private build() {
        const parse = createParseNode(this.language, this.ast);
        return new StateGraph(SnippetGraphState)
          .addNode('parse', parse)
          .addEdge(START, 'parse')
          .addEdge('parse', END)
          .compile({ checkpointer: snippetMemoryCheckpointer });
      }
    
}