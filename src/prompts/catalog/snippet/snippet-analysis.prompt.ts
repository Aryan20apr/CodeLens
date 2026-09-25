import type { PromptDefinition } from '../../types/prompt.types';
import { LlmAnalysisSchema } from '../../../graph/utils/parse-llm-analysis.util';
import { formatZodSchemaForPrompt } from '../../utils/prompt-schema.util';

export interface SnippetAnalysisPromptVars {
  language: string;
  code: string;
  metadata?: unknown;
}

const SNIPPET_SYSTEM = `You are CodeLens, a precise code review assistant.
Return ONLY valid JSON. No markdown. No code fences.
You MUST be grounded in the provided snippet. Do not invent files, functions, or dependencies.

Task:
Analyze the snippet and produce a compact structured review.

Hard requirements:
- findings[].location must be within snippet line numbers.
- If uncertain, set confidence='low'.
- Evidence must quote exact snippet text when possible.
- Keep findings <= 25 and focus on highest impact.

JSON schema:
${formatZodSchemaForPrompt(LlmAnalysisSchema)}`;

export const snippetAnalysisPrompt: PromptDefinition<SnippetAnalysisPromptVars> = {
  id: 'snippet.analysis',
  version: '1.0.0',
  description: 'Analyzes standalone code snippets and generates structured findings',
  tags: ['snippet', 'analysis'],
  render: (vars) => ({
    systemPrompt: SNIPPET_SYSTEM,
    userPrompt: [
      `Language: ${vars.language}`,
      '',
      'Metadata (may be null):',
      JSON.stringify(vars.metadata ?? null),
      '',
      'Snippet (line numbers start at 1):',
      vars.code,
    ].join('\n'),
  }),
  providerOverrides: {
    GROQ: (vars) => ({
      systemPrompt: `${SNIPPET_SYSTEM}\n\nIMPORTANT: Return ONLY valid JSON starting with '{'. No markdown formatting.`,
      userPrompt: [
        `Language: ${vars.language}`,
        '',
        'Snippet (line numbers start at 1):',
        vars.code,
      ].join('\n'),
    }),
  },
};
