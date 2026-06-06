import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { LlmAnalysis } from '../../graph/state.types';
import { extractJson } from '../../graph/utils/extract-json.util';
import { FindingSchema } from '../../graph/utils/parse-llm-analysis.util';


export const PrFindingSchema = FindingSchema.extend({
    filePath: z.string().min(1),
  });
  
  export const PrLlmAnalysisSchema = z.object({
    summary: z.string().min(10),
    findings: z.array(PrFindingSchema).max(30),
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
 * Parse LLM output; on failure run one repair invoke via supplied callback.
 */
export async function parsePrLlmAnalysisWithRepair(
    raw: string,
    repairInvoke: (repairHint: string) => Promise<string>,
  ): Promise<LlmAnalysis> {
    try {
      return parsePrLlmAnalysis(raw);
    } catch (firstErr) {
      const repairedRaw = await repairInvoke(JSON_REPAIR_HUMAN);
      try {
        return parsePrLlmAnalysis(repairedRaw);
      } catch {
        throw new Error(
          `LLM analysis JSON invalid after repair: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
        );
      }
    }
  }