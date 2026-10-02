import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { LlmAnalysis } from '../../graph/state.types';
import { extractJson } from '../../graph/utils/extract-json.util';
import { FindingSchema } from '../../graph/utils/parse-llm-analysis.util';


export const PrFindingSchema = FindingSchema.extend({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Relative file path to the changed file in the repository (e.g. src/auth/auth.service.ts)'
    ),
});

export const PrLlmAnalysisSchema = z.object({
  thoughtProcess: z
    .string()
    .optional()
    .describe(
      'Internal step-by-step reasoning evaluating the PR diff, validating line references, checking cross-file impacts, and eliminating false positives before finalizing findings'
    ),
  summary: z
    .string()
    .min(10)
    .describe(
      'Executive summary of the pull request review highlighting major risks, critical findings, and overall readiness to merge'
    ),
  findings: z
    .array(PrFindingSchema)
    .max(30)
    .describe(
      'Actionable review findings ordered from highest severity to lowest. Cites exact line numbers and paths from the PR changes'
    ),
});


export type PrLlmAnalysisOut = z.infer<typeof PrLlmAnalysisSchema>;

export function parsePrLlmAnalysis(raw: string): LlmAnalysis {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('LLM did not return valid JSON');
  }

  const validated = PrLlmAnalysisSchema.parse(parsed);

  return {
    summary: validated.summary,
    findings: validated.findings.map((finding) => ({
      id: randomUUID(),
      ...finding,
    })),
  };
}

const JSON_REPAIR_HUMAN =
  'Your previous response was not valid JSON for the required schema. Return ONLY valid JSON. No markdown. No code fences. Fix the JSON to match the schema exactly.';

/**
 * Parse LLM output; on failure run one repair invoke via supplied callback with validation error context.
 */
export async function parsePrLlmAnalysisWithRepair(
  raw: string,
  repairInvoke: (repairHint: string) => Promise<string>,
): Promise<LlmAnalysis> {
  try {
    return parsePrLlmAnalysis(raw);
  } catch (firstErr) {
    const errorDetails =
      firstErr instanceof z.ZodError
        ? firstErr.issues
          .map(
            (i) =>
              `- Field "${i.path.join('.')}": ${i.message} (code: ${i.code})`,
          )
          .join('\n')
        : firstErr instanceof Error
          ? firstErr.message
          : String(firstErr);

    const repairHint = `${JSON_REPAIR_HUMAN}\n\nValidation error:\n${errorDetails}`;
    const repairedRaw = await repairInvoke(repairHint);
    try {
      return parsePrLlmAnalysis(repairedRaw);
    } catch {
      throw new Error(`LLM analysis JSON invalid after repair: ${errorDetails}`);
    }
  }
}
