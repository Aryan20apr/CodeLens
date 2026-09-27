import { randomUUID } from 'crypto';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import { formatCrossFileHintsForPrompt } from '../../../../review/context/format-cross-file-hints.util';
import { extractTextFromLlmContent } from '../../../../review/context/llm-content.util';
import { extractJson } from '../../../utils/extract-json.util';
import {
  invokeWithStructuredOutput,
  repairJsonWithLlm,
} from '../../../utils/structured-output.util';
import {
  PrLlmAnalysisSchema,
  type PrLlmAnalysisOut,
} from '../../../../review/findings/pr-finding.schema';
import type { LlmAnalysis } from '../../../state.types';
import type { LlmService } from '../../../../llm/llm.service';
import type { AnalyzeAgentStateType } from '../analyze-agent.state.annotation';
import { getAnalyzeAgentConfigurable } from '../analyze-agent.types';

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

    const userLlmKey = config?.configurable?.userLlmKey;
    const model = llm.getChatModel(userLlmKey);

    let parsedAnalysis: PrLlmAnalysisOut | null = null;

    // If analyzeLlm already generated JSON text in its final round, attempt safe extraction first.
    // If validation fails (e.g. enum mismatch or syntax issue), heal it with repairJsonWithLlm rather than discarding.
    if (lastAiText.trim()) {
      try {
        const jsonStr = extractJson(lastAiText.trim());
        parsedAnalysis = PrLlmAnalysisSchema.parse(JSON.parse(jsonStr));
      } catch (err) {
        try {
          const repaired = await repairJsonWithLlm(
            model,
            PrLlmAnalysisSchema,
            lastAiText.trim(),
            err,
          );
          parsedAnalysis = repaired.parsed;
        } catch {
          // If repair fails, fall back to explicit structured output call below
          parsedAnalysis = null;
        }
      }
    }

    // If no valid JSON was already present, request structured output directly from the model
    if (!parsedAnalysis) {
      // Sanitize messages: If the last message has unfulfilled tool calls because the tool round limit
      // was reached, replace it with a clean text message so providers like OpenAI/NIM do not fail
      // on missing tool responses when structured output is invoked.
      const messagesForFinalize = state.messages.map((msg, idx) => {
        if (
          idx === state.messages.length - 1 &&
          msg instanceof AIMessage &&
          msg.tool_calls &&
          msg.tool_calls.length > 0 &&
          !msg.content
        ) {
          return new AIMessage({
            content:
              'Completed code and symbol inspection. Ready to finalize review.',
          });
        }
        return msg;
      });

      const structuredResult = await invokeWithStructuredOutput(
        model,
        PrLlmAnalysisSchema,
        [
          ...messagesForFinalize,
          new HumanMessage(
            [
              crossFileHints.length > 0
                ? `\n## Cross-file search results\n${formatCrossFileHintsForPrompt(crossFileHints)}`
                : '',
              'Finalize your review findings and summary matching the structured schema.',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        ],
        {
          name: 'pr_review_analysis',
        },
      );
      parsedAnalysis = structuredResult.parsed;
    }

    if (!parsedAnalysis) {
      throw new Error(
        'Failed to finalize review analysis: structured output returned null or empty result',
      );
    }

    const llmAnalysis: LlmAnalysis = {
      summary: parsedAnalysis.summary,
      findings: parsedAnalysis.findings.map((f) => ({
        id: randomUUID(),
        ...f,
      })),
    };

    return {
      llmAnalysis,
      crossFileHints,
      searchToolCallCount,
    };
  };
}