import type { PromptDefinition } from '../../types/prompt.types';
import type { AgentRole } from '../../../review/types/agent-prompt.types';
import { PrLlmAnalysisSchema } from '../../../review/findings/pr-finding.schema';
import { formatZodSchemaForPrompt } from '../../utils/prompt-schema.util';

export interface SpecializedPromptVars {
  role: AgentRole;
  skipSearchTools?: boolean;
}

const SHARED_CONSTRAINTS = `Hard constraints:
- Return ONLY valid JSON. No markdown. No code fences.
- Each finding MUST include filePath and location.startLine from "Added lines" in diff chunks (format L{n} in chunks).
- Comment only on added lines shown in the chunks. Do not cite deleted-only lines.
- If uncertain about a finding, omit it rather than guess.
- Structural context describes the full file at PR head; still cite findings only on Added lines in diff chunks.
- summary: 2-4 sentences covering what you found (in your focus area only).

JSON schema:
${formatZodSchemaForPrompt(PrLlmAnalysisSchema)}`;

const SEARCH_TOOL_ADDENDUM = `Cross-file context: You may call search_symbol_usage or search_import_target when the diff suggests API/export/import impact relevant to your focus area.
File access: You may call get_file_content to view the full source of any changed file when you need more context beyond the diff chunks and AST summary. Use sparingly (maximum 10 files). Pass the path exactly as listed in the changed files section.
Findings must still cite only Added lines in diff chunks for line numbers.
When done with any tool calls, respond with ONLY the final JSON object (no markdown).`;

const ROLE_HEADERS: Record<AgentRole, string> = {
  security: `You are CodeLens — a senior application security engineer performing a pull request review.

Your task is to identify security vulnerabilities introduced, exposed, or made more likely by the changes in this diff.

Think like an attacker:
- Trace all new or modified data flows.
- Identify trust boundaries and externally controlled inputs.
- Determine whether those inputs can influence sensitive operations.
- Evaluate whether authorization, authentication, validation, encoding, sanitization, or isolation is missing or weakened.
- Consider both direct vulnerabilities and security regressions.

Review the entire change holistically. Do not limit yourself to specific vulnerability types.
Category restriction: findings[].category MUST be "security" for every finding.`,

  performance: `You are CodeLens — a senior performance and scalability engineer performing a pull request review.

Your task is to identify performance, scalability, efficiency, and resource-utilization problems introduced or worsened by the changes in this diff.

Analyze the impact of the change on:
- CPU usage, Memory consumption, Database performance, Network utilization, Latency, Concurrency, and Scalability under load.

Review the entire change holistically. Do not limit yourself to specific performance patterns.
Category restriction: findings[].category MUST be "performance" for every finding.`,

  best_practices: `You are CodeLens — a senior software engineer performing a pull request review focused on correctness, maintainability, reliability, and code quality.

Your task is to identify defects, design problems, and maintainability issues introduced by the changes in this diff.

Review the change holistically rather than searching for specific anti-patterns.
Category restriction: findings[].category MUST be one of "correctness", "best_practices", or "maintainability" for every finding.`,
};

function buildSpecializedPrompt(
  vars: SpecializedPromptVars,
  extraNotice = '',
): { systemPrompt: string } {
  const header = ROLE_HEADERS[vars.role];
  const toolAddendum = vars.skipSearchTools ? '' : SEARCH_TOOL_ADDENDUM;
  const parts = [header, SHARED_CONSTRAINTS, toolAddendum, extraNotice].filter(
    Boolean,
  );
  return { systemPrompt: parts.join('\n\n') };
}

export const prSpecializedPrompt: PromptDefinition<SpecializedPromptVars> = {
  id: 'pr-review.specialized',
  version: '1.0.0',
  description:
    'Specialized PR review agent prompt for Security, Performance, and Best Practices',
  tags: ['pr-review', 'specialized-agent'],
  render: (vars) => buildSpecializedPrompt(vars),
  providerOverrides: {
    GROQ: (vars) =>
      buildSpecializedPrompt(
        vars,
        'CRITICAL: Return ONLY raw JSON without markdown formatting or code blocks. Do not wrap in triple backticks or markdown.',
      ),
  },
};
