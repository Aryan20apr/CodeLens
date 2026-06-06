import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { END, GraphRecursionError, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { AppConfig } from '../../../config/app-config.types';
import { APP_CONFIG } from '../../../config/config.constants';
import { LlmService } from '../../../llm/llm.service';
import type { CrossFileHint } from '../../../review/types/cross-file-hint.types';
import {
  ANALYZE_AGENT_CONFIG_KEY,
  type AnalyzeAgentConfigurable,
} from '../../../review/types/analyze-agent-configurable.types';
import { extractTextFromLlmContent } from '../../../review/context/llm-content.util';
import { createAnalyzeSearchTools } from '../../../review/context/pr-search-tools';
import { PrSearchToolExecutorService } from '../../../review/context/pr-search-tool-executor.service';
import {
  AnalyzeAgentState,
  type AnalyzeAgentStateType,
} from './analyze-agent.state.annotation';
import { routeAfterAnalyzeLlm } from './analyze-routing.util';
import { createAnalyzeFinalizeNode } from './nodes/analyze-finalize.node';
import { createAnalyzeLlmNode } from './nodes/analyze-llm.node';
import type { LlmAnalysis } from '../../../graph/state.types';
import { parsePrLlmAnalysisWithRepair } from '../../../review/findings/pr-finding.schema';

export type AnalyzeAgentInvokeInput = {
  systemPrompt: string;
  userContent: string;
  installationId: bigint;
  repoFullName: string;
  onSearchToolCall?: AnalyzeAgentConfigurable['onSearchToolCall'];
};

export type AnalyzeAgentInvokeResult = {
  llmAnalysis: LlmAnalysis;
  crossFileHints: CrossFileHint[];
  searchToolCallCount: number;
};

@Injectable()
export class PrAnalyzeAgentFactory implements OnModuleInit {
  private readonly logger: Logger;
  private readonly searchConfig: AppConfig['prReview']['search'];
  private compiled: ReturnType<PrAnalyzeAgentFactory['build']> | null = null;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly llm: LlmService,
    private readonly searchExecutor: PrSearchToolExecutorService,
  ) {
    this.logger = logger.child({ context: PrAnalyzeAgentFactory.name });
    this.searchConfig = config.prReview.search;
  }

  onModuleInit() {
    this.compiled = this.build();
    this.logger.info(
      'LangGraph (analyze-agent) compiled: analyzeLlm -> searchTools loop -> analyzeFinalize',
    );
  }

  getCompiledGraph() {
    if (!this.compiled) {
      this.compiled = this.build();
    }
    return this.compiled;
  }

  async invokeDirect(
    systemPrompt: string,
    userContent: string,
  ): Promise<LlmAnalysis> {
    const className = PrAnalyzeAgentFactory.name;
    const methodName = 'invokeDirect';

    const model = this.llm.getChatModel();
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ];

    const response = await model.invoke(messages);
    const text = extractTextFromLlmContent(response.content);
    if (!text.trim()) {
      throw new Error('LLM returned empty PR analysis');
    }

    const llmAnalysis = await parsePrLlmAnalysisWithRepair(
      text.trim(),
      async (repairHint) => {
        const repairResponse = await model.invoke([
          ...messages,
          new HumanMessage(repairHint),
        ]);
        const repairText = extractTextFromLlmContent(repairResponse.content);
        if (!repairText.trim()) {
          throw new Error('LLM returned empty PR analysis on repair');
        }
        return repairText.trim();
      },
    );

    this.logger.info(`[${className}] [${methodName}] :: Direct analyze completed`, {
      findingCount: llmAnalysis.findings.length,
      summaryChars: llmAnalysis.summary.length,
    });

    return llmAnalysis;
  }

  async invokeWithSearchTools(
    input: AnalyzeAgentInvokeInput,
  ): Promise<AnalyzeAgentInvokeResult> {
    const className = PrAnalyzeAgentFactory.name;
    const methodName = 'invokeWithSearchTools';

    const hintsAccumulator: CrossFileHint[] = [];
    const searchToolCallCount = { current: 0 };
    const searchCtx = this.searchExecutor.createContext(
      input.installationId,
      input.repoFullName,
    );

    const analyzeAgent: AnalyzeAgentConfigurable = {
      installationId: String(input.installationId),
      repoFullName: input.repoFullName,
      searchCtx,
      hintsAccumulator,
      searchToolCallCount,
      maxToolRounds: this.searchConfig.maxToolRounds,
      onSearchToolCall: input.onSearchToolCall,
    };

    const graph = this.getCompiledGraph();
    const maxToolRounds = this.searchConfig.maxToolRounds;
    const recursionLimit = maxToolRounds * 2 + 4;

    const initialState: Partial<AnalyzeAgentStateType> = {
      messages: [
        new SystemMessage(input.systemPrompt),
        new HumanMessage(
          `${input.userContent}\n\nYou may call search tools before producing findings. When done searching, respond with ONLY valid JSON matching the required schema.`,
        ),
      ],
      crossFileHints: [],
      searchToolCallCount: 0,
      toolRoundCount: 0,
    };

    try {
      const result = await graph.invoke(initialState, {
        configurable: {
          [ANALYZE_AGENT_CONFIG_KEY]: analyzeAgent,
        },
        recursionLimit,
        runName: 'analyze-agent',
      });

      if (!result.llmAnalysis?.summary?.trim()) {
        throw new Error('Analyze agent finished without llmAnalysis summary');
      }

      this.logger.info(`[${className}] [${methodName}] :: Analyze agent completed`, {
        repoFullName: input.repoFullName,
        summaryChars: result.llmAnalysis.summary.length,
        findingCount: result.llmAnalysis.findings.length,
        crossFileHintCount: result.crossFileHints.length,
        searchToolCallCount: result.searchToolCallCount,
      });

      return {
        llmAnalysis: result.llmAnalysis,
        crossFileHints: result.crossFileHints,
        searchToolCallCount: result.searchToolCallCount,
      };
    } catch (err) {
      if (err instanceof GraphRecursionError) {
        this.logger.error(
          `[${className}] [${methodName}] :: Analyze agent recursion limit exceeded`,
          {
            repoFullName: input.repoFullName,
            recursionLimit,
            error: err,
          },
        );
        throw new Error(
          `PR analyze agent exceeded recursion limit (${recursionLimit})`,
        );
      }
      throw err;
    }
  }

  private build() {
    const tools = createAnalyzeSearchTools(this.searchExecutor);
    const analyzeLlm = createAnalyzeLlmNode(this.llm, tools);
    const searchTools = new ToolNode(tools);
    const analyzeFinalize = createAnalyzeFinalizeNode(this.llm);

    return new StateGraph(AnalyzeAgentState)
      .addNode('analyzeLlm', analyzeLlm)
      .addNode('searchTools', searchTools)
      .addNode('analyzeFinalize', analyzeFinalize)
      .addEdge(START, 'analyzeLlm')
      .addConditionalEdges('analyzeLlm', routeAfterAnalyzeLlm, [
        'searchTools',
        'analyzeFinalize',
      ])
      .addEdge('searchTools', 'analyzeLlm')
      .addEdge('analyzeFinalize', END)
      .compile();
  }
}
