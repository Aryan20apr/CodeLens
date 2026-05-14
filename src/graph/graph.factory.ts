// src/graph/graph.factory.ts

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { END, START, StateGraph } from '@langchain/langgraph';

import { LanguageDetectService } from './lib/language-detect.service';
import { AstExtractService } from './lib/ast-extract.service';
import { createParseNode } from './nodes/parse.node';
import {
  SnippetGraphState,
  snippetMemoryCheckpointer,
} from './state.annotation';

import type { SnippetSource } from './state.types';
import { createLlmAnalysisNode } from './nodes/llm-analysis.node';
import { createScoreReportNode } from './nodes/score-report.node';
import { LlmService } from 'src/llm/llm.service';

@Injectable()
export class GraphFactory implements OnModuleInit {
  private readonly logger: Logger;

  private compiled: ReturnType<GraphFactory['build']> | null = null;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly language: LanguageDetectService,
    private readonly ast: AstExtractService,
    private readonly llm: LlmService,
  ) {
    this.logger = logger.child({
      context: GraphFactory.name,
    });
  }

  onModuleInit() {
    this.compiled = this.build();

    this.logger.info(
      'LangGraph (snippet) compiled: START -> parse -> llm-analysis -> score-report -> END',
    );
  }

  getCompiledGraph(): ReturnType<GraphFactory['build']> {
    if (!this.compiled) {
      this.compiled = this.build();
    }

    return this.compiled;
  }

  async invokeSnippet(source: SnippetSource, threadId: string) {
    const className = GraphFactory.name;
    const methodName = 'invokeSnippet';

    this.logger.info(`[${className}.${methodName}] Invoking snippet graph`, {
      threadId,
      source: {
        type: source.type,
        language: source.language,
        filename: source.filename,
        codeLength: source.code?.length ?? 0,
      },
    });

    const graph = this.getCompiledGraph();

    const initialState = {
      source,
      language: null,
      metadata: null,
      llmAnalysis: null,
      score: null,
      report: null,
      status: 'pending',
      error: null,
      events: [],
    } satisfies typeof SnippetGraphState.State;

    let result;
    try {
      result = await graph.invoke(initialState, {
        configurable: {
          thread_id: threadId,
        },
        runName: 'snippet-graph',
        tags: ['snippet'],
        metadata: {
          threadId,
          languageHint: source.language,
          filename: source.filename ?? null,
          codeLength: source.code?.length ?? 0,
        },
      });
      this.logger.info(`[${className}.${methodName}] Execution completed`, {
        threadId,
        status: result.status,
        error: result.error,
        language: result.language,
      });
    } catch (error) {
      this.logger.error(`[${className}.${methodName}] Execution failed`, {
        threadId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    return result;
  }

  private build() {
    const className = GraphFactory.name;
    const methodName = 'build';
    this.logger.debug(
      `[${className}.${methodName}] Building snippet graph pipeline`,
    );
    const parse = createParseNode(this.language, this.ast);
    const llmAnalysis = createLlmAnalysisNode(this.llm);
    const scoreReport = createScoreReportNode();

    return new StateGraph(SnippetGraphState)
      .addNode('parse', parse)
      .addNode('llm-analysis', llmAnalysis)
      .addNode('score-report', scoreReport)
      .addEdge(START, 'parse')
      .addEdge('parse', 'llm-analysis')
      .addEdge('llm-analysis', 'score-report')
      .addEdge('score-report', END)
      .compile({
        checkpointer: snippetMemoryCheckpointer,
      });
  }
}
