import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';

import type { LlmService } from 'src/llm/llm.service';
import type { GraphEvent, SnippetGraphStateType } from '../state.annotation';
import { parseLlmAnalysis } from '../utils/parse-llm-analysis.util';
import type { PromptRegistryService } from '../../prompts/prompt-registry.service';

type NodeUpdate = Partial<
  Pick<SnippetGraphStateType, 'status' | 'error' | 'events' | 'llmAnalysis'>
>;

export function createLlmAnalysisNode(
  llm: LlmService,
  promptRegistry?: PromptRegistryService,
) {
  return async (
    state: SnippetGraphStateType,
    config?: RunnableConfig,
  ): Promise<NodeUpdate> => {
    const now = () => new Date().toISOString();

    if (!state.source) {
      return {
        status: 'failed',
        error: 'Missing state.source',
        events: [
          {
            node: 'llm-analysis',
            status: 'failed',
            message: 'Missing state.source',
            at: now(),
          },
        ],
      };
    }
    const language = state.language ?? state.source.language ?? 'unknown';
    const code = state.source.code;
    const metadata = state.metadata;

    const startEvents: GraphEvent[] = [
      {
        node: 'llm-analysis',
        status: 'started',
        message: 'Running LLM analysis',
        at: now(),
      },
    ];

    try {
      const userLlmKey = config?.configurable?.userLlmKey;
      const chat = llm.getChatModel(userLlmKey);

      let res;
      if (promptRegistry) {
        const rendered = promptRegistry.render(
          'snippet.analysis',
          { language, code, metadata },
          { provider: userLlmKey?.provider },
        );
        res = await chat.invoke(
          [
            new SystemMessage(rendered.systemPrompt),
            new HumanMessage(rendered.userPrompt!),
          ],
          {
            tags: rendered.langchainMetadata.tags,
            metadata: rendered.langchainMetadata.metadata,
          },
        );
      } else {
        const system = new SystemMessage(
          [
            'You are CodeLens, a precise code review assistant.',
            'Return ONLY valid JSON. No markdown. No code fences.',
            'You MUST be grounded in the provided snippet. Do not invent files, functions, or dependencies.',
            '',
            'Task:',
            'Analyze the snippet and produce a compact structured review.',
            '',
            'Hard requirements:',
            '- findings[].location must be within snippet line numbers.',
            "- If uncertain, set confidence='low'.",
            '- Evidence must quote exact snippet text when possible.',
            '- Keep findings <= 25 and focus on highest impact.',
            '',
            'JSON schema:',
            `{
          "summary": string,
          "findings": [{
            "category": "security"|"correctness"|"performance"|"best_practices"|"maintainability",
            "severity": "critical"|"warning"|"info",
            "title": string,
            "description": string,
            "location": { "startLine": number, "endLine": number },
            "evidenceSnippet"?: string,
            "suggestedFix"?: string,
            "confidence": "high"|"medium"|"low"
          }]
        }`,
          ].join('\n'),
        );

        const human = new HumanMessage(
          [
            `Language: ${language}`,
            '',
            'Metadata (may be null):',
            JSON.stringify(metadata ?? null),
            '',
            'Snippet (line numbers start at 1):',
            code,
          ].join('\n'),
        );

        res = await chat.invoke([system, human]);
      }

      const raw =
        typeof res.content === 'string'
          ? res.content
          : JSON.stringify(res.content);
      console.log('Raw response: ' + raw);
      // Strict JSON parse + validate
      const llmAnalysis = parseLlmAnalysis(raw);

      return {
        llmAnalysis,
        status: 'complete',
        error: null,
        events: startEvents.concat([
          {
            node: 'llm-analysis',
            status: 'completed',
            message: `LLM analysis produced ${llmAnalysis.findings.length} findings`,
            at: now(),
          },
        ]),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        status: 'failed',
        error: message,
        events: startEvents.concat([
          { node: 'llm-analysis', status: 'failed', message, at: now() },
        ]),
      };
    }
  };
}
