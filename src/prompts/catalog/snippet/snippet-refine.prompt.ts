import type { PromptDefinition } from '../../types/prompt.types';

export interface SnippetRefinePromptVars {
  previousAnalysis: unknown;
  code: string;
}

const REFINE_SYSTEM = `You are refining a previous code review.

Your task:
- remove weak findings
- improve evidence quality
- improve descriptions
- keep only high-value findings

Return ONLY valid JSON.`;

export const snippetRefinePrompt: PromptDefinition<SnippetRefinePromptVars> = {
  id: 'snippet.refine',
  version: '1.0.0',
  description:
    'Refines previous snippet code review to eliminate low confidence items',
  tags: ['snippet', 'refinement'],
  render: (vars) => ({
    systemPrompt: REFINE_SYSTEM,
    userPrompt: JSON.stringify({
      previousAnalysis: vars.previousAnalysis,
      code: vars.code,
    }),
  }),
};
