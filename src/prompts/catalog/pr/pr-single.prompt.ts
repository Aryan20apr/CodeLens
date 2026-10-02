import type { PromptDefinition } from '../../types/prompt.types';
import { PrLlmAnalysisSchema } from '../../../review/findings/pr-finding.schema';
import { formatZodSchemaForPrompt } from '../../utils/prompt-schema.util';

export interface PrSinglePromptVars {
  skipSearchTools?: boolean;
}

const SYSTEM_PROMPT_BASE = `You are CodeLens, a precise pull-request review assistant.
Return ONLY valid JSON. No markdown. No code fences.
Review ONLY the provided diff chunk blocks below. Do not invent files or line numbers.

Hard requirements:
- Each finding MUST include filePath and location.startLine from "Added lines" in diff chunks (format L{n} in chunks).
- Comment only on added lines shown in the chunks. Do not cite deleted-only lines.
- If uncertain about a finding, omit it rather than guess.
- Structural context describes the full file at PR head; still cite findings only on Added lines in diff chunks.
- Do not cite line numbers from structural context unless they appear in chunk added lines.
- Keep findings focused; prefer fewer high-confidence items.
- summary: 2-4 sentences on the PR as a whole.

JSON schema:
${formatZodSchemaForPrompt(PrLlmAnalysisSchema)}`;

const SEARCH_TOOLS_PROMPT = `Cross-file context: You may call search_symbol_usage or search_import_target when the diff suggests API/export/import impact.
Use search sparingly (small PRs often need none). Findings must still cite only Added lines in diff chunks for line numbers.
Cross-file search results are hints only; you may reference hinted file paths in filePath when search supports a cross-file concern.
When done searching, respond with ONLY the final JSON object (no markdown).`;

export const prSinglePrompt: PromptDefinition<PrSinglePromptVars> = {
  id: 'pr-review.single',
  version: '1.0.0',
  description: 'Single-agent PR review prompt',
  tags: ['pr-review', 'single-agent'],
  render: (vars) => {
    const parts = [
      SYSTEM_PROMPT_BASE,
      vars.skipSearchTools ? '' : SEARCH_TOOLS_PROMPT,
    ].filter(Boolean);
    return { systemPrompt: parts.join('\n\n') };
  },
  providerOverrides: {
    GROQ: (vars) => {
      const parts = [
        SYSTEM_PROMPT_BASE,
        vars.skipSearchTools ? '' : SEARCH_TOOLS_PROMPT,
        'IMPORTANT: Return raw JSON only. Do not wrap in markdown or backticks.',
      ].filter(Boolean);
      return { systemPrompt: parts.join('\n\n') };
    },
  },
};
