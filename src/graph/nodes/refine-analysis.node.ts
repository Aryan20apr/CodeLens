import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import type { LlmService } from 'src/llm/llm.service';
import { parseLlmAnalysis } from "../utils/parse-llm-analysis.util";

import type {
  GraphEvent,
  SnippetGraphStateType,
} from '../state.annotation';

type NodeUpdate = Partial<
  Pick<
    SnippetGraphStateType,
    | 'llmAnalysis'
    | 'iteration'
    | 'events'
    | 'status'
    | 'error'
  >
>;

export function createRefineAnalysisNode(
  llm: LlmService,
) {
  return async (
    state: SnippetGraphStateType,
  ): Promise<NodeUpdate> => {
    const now = () => new Date().toISOString();

    const analysis = state.llmAnalysis;

    if (!analysis || !state.source) {
      return {
        status: 'failed',
        error: 'Missing analysis/source',
      };
    }

    try {
      const chat = llm.getChatModel();

      const system = new SystemMessage(`
You are refining a previous code review.

Your task:
- remove weak findings
- improve evidence quality
- improve descriptions
- keep only high-value findings

Return ONLY valid JSON.
`);

      const human = new HumanMessage(
        JSON.stringify({
          previousAnalysis: analysis,
          code: state.source.code,
        }),
      );

      const res = await chat.invoke([
        system,
        human,
      ]);

      const raw =
        typeof res.content === 'string'
          ? res.content
          : JSON.stringify(res.content);
          console.debug?.(
            "[LLM RAW OUTPUT]",
            raw,
          );
         const refined = parseLlmAnalysis(raw);

      return {
        llmAnalysis: refined,
        iteration: state.iteration + 1,
        status: 'complete',
        error: null,
        events: [
          {
            node: 'refine-analysis',
            status: 'completed',
            message: 'Analysis refined',
            at: now(),
          },
        ],
      };
    } catch (e) {
      return {
        status: 'failed',
        error:
          e instanceof Error
            ? e.message
            : String(e),
        events: [
          {
            node: 'refine-analysis',
            status: 'failed',
            message:
              e instanceof Error
                ? e.message
                : String(e),
            at: now(),
          },
        ],
      };
    }
  };
}