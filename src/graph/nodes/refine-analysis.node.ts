import { randomUUID } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';

import type { LlmService } from 'src/llm/llm.service';
import type { LlmAnalysis } from '../state.types';
import { LlmAnalysisSchema } from '../utils/parse-llm-analysis.util';
import { invokeWithStructuredOutput } from '../utils/structured-output.util';
import type { PromptRegistryService } from '../../prompts/prompt-registry.service';

import type { SnippetGraphStateType } from '../state.annotation';

type NodeUpdate = Partial<
  Pick<
    SnippetGraphStateType,
    'llmAnalysis' | 'iteration' | 'events' | 'status' | 'error'
  >
>;

export function createRefineAnalysisNode(
  llm: LlmService,
  promptRegistry?: PromptRegistryService,
) {
  return async (
    state: SnippetGraphStateType,
    config?: RunnableConfig,
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
      const userLlmKey = config?.configurable?.userLlmKey;
      const chat = llm.getChatModel(userLlmKey);

      let parsedAnalysis;
      if (promptRegistry) {
        const rendered = promptRegistry.render(
          'snippet.refine',
          { previousAnalysis: analysis, code: state.source.code },
          { provider: userLlmKey?.provider },
        );
        const { parsed } = await invokeWithStructuredOutput(
          chat,
          LlmAnalysisSchema,
          [
            new SystemMessage(rendered.systemPrompt),
            new HumanMessage(rendered.userPrompt!),
          ],
          {
            name: 'snippet_refine_analysis',
            callOptions: {
              tags: rendered.langchainMetadata.tags,
              metadata: rendered.langchainMetadata.metadata,
            },
          },
        );
        parsedAnalysis = parsed;
      } else {
        const system = new SystemMessage(`
You are refining a previous code review.

Your task:
- remove weak findings
- improve evidence quality
- improve descriptions
- keep only high-value findings
`);

        const human = new HumanMessage(
          JSON.stringify({
            previousAnalysis: analysis,
            code: state.source.code,
          }),
        );

        const { parsed } = await invokeWithStructuredOutput(
          chat,
          LlmAnalysisSchema,
          [system, human],
          {
            name: 'snippet_refine_analysis',
          },
        );
        parsedAnalysis = parsed;
      }

      const refined: LlmAnalysis = {
        summary: parsedAnalysis.summary,
        findings: parsedAnalysis.findings.map((finding) => ({
          id: randomUUID(),
          ...finding,
        })),
      };

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
        error: e instanceof Error ? e.message : String(e),
        events: [
          {
            node: 'refine-analysis',
            status: 'failed',
            message: e instanceof Error ? e.message : String(e),
            at: now(),
          },
        ],
      };
    }
  };
}
