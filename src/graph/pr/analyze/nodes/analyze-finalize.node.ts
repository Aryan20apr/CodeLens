import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import { formatCrossFileHintsForPrompt } from '../../../../review/context/format-cross-file-hints.util';
import { extractTextFromLlmContent } from '../../../../review/context/llm-content.util';

import { parsePrLlmAnalysisWithRepair } from '../../../../review/findings/pr-finding.schema';
import type { LlmService } from '../../../../llm/llm.service';
import type { AnalyzeAgentStateType } from '../analyze-agent.state.annotation';
import { getAnalyzeAgentConfigurable } from '../analyze-agent.types';

const FINALIZE_JSON_NUDGE =
  'Produce the final PR review as ONLY valid JSON matching the required schema. No markdown. No code fences.';

export function createAnalyzeFinalizeNode(llm: LlmService) {
  return async (
    state: AnalyzeAgentStateType,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<AnalyzeAgentStateType>> => {
    const cfg = getAnalyzeAgentConfigurable(config);
    const crossFileHints = cfg?.hintsAccumulator ?? state.crossFileHints;
    const searchToolCallCount =
      cfg?.searchToolCallCount.current ?? state.searchToolCallCount;

    const lastAi = [...state.messages]
      .reverse()
      .find((m): m is AIMessage => m instanceof AIMessage);
    const lastAiText = lastAi ? extractTextFromLlmContent(lastAi.content) : '';

    const usedTools = searchToolCallCount > 0;
    const model = llm.getChatModel();

    async function invokeForText(
      messages: Parameters<typeof model.invoke>[0],
    ): Promise<string> {
      const response = await model.invoke(messages);
      const text = extractTextFromLlmContent(response.content);
      if (!text.trim()) {
        throw new Error('LLM returned empty PR analysis');
      }
      return text.trim();
    }

    let rawText: string;

    if (lastAiText.trim() && !usedTools) {
      rawText = lastAiText.trim();
    } else if (
      lastAiText.trim() &&
      usedTools &&
      lastAi?.tool_calls?.length === 0
    ) {
      rawText = lastAiText.trim();
    } else {
      rawText = await invokeForText([
        ...state.messages,
        new HumanMessage(
          [
            FINALIZE_JSON_NUDGE,
            crossFileHints.length > 0
              ? `\n## Cross-file search results\n${formatCrossFileHintsForPrompt(crossFileHints)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ]);
    }

    const llmAnalysis = await parsePrLlmAnalysisWithRepair(
      rawText,
      async (repairHint) =>
        invokeForText([
          ...state.messages,
          new HumanMessage(
            [
              FINALIZE_JSON_NUDGE,
              crossFileHints.length > 0
                ? `\n## Cross-file search results\n${formatCrossFileHintsForPrompt(crossFileHints)}`
                : '',
              '',
              repairHint,
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        ]),
    );

    return {
      llmAnalysis,
      crossFileHints,
      searchToolCallCount,
    };
  };
}