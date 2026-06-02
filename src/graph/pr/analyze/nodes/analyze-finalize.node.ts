import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import { formatCrossFileHintsForPrompt } from '../../../../review/context/format-cross-file-hints.util';
import { extractTextFromLlmContent } from '../../../../review/context/llm-content.util';
import { getAnalyzeAgentConfigurable } from '../../../../review/context/analyze-agent-configurable.types';
import type { LlmService } from '../../../../llm/llm.service';
import type { AnalyzeAgentStateType } from '../analyze-agent.state.annotation';

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

    let summaryMarkdown: string;

    if (lastAiText.trim() && !usedTools) {
      summaryMarkdown = lastAiText.trim();
    } else if (lastAiText.trim() && usedTools && lastAi?.tool_calls?.length === 0) {
      summaryMarkdown = lastAiText.trim();
    } else {
      const model = llm.getChatModel();
      const response = await model.invoke([
        ...state.messages,
        new HumanMessage(
          [
            'Produce the final PR review markdown now.',
            crossFileHints.length > 0
              ? `\n## Cross-file search results\n${formatCrossFileHintsForPrompt(crossFileHints)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ]);
      const text = extractTextFromLlmContent(response.content);
      if (!text.trim()) {
        throw new Error('LLM returned empty PR summary');
      }
      summaryMarkdown = text.trim();
    }

    return {
      summaryMarkdown,
      crossFileHints,
      searchToolCallCount,
    };
  };
}
