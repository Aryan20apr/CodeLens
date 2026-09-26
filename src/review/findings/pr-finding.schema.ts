import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { LlmAnalysis } from '../../graph/state.types';
import { extractJson } from '../../graph/utils/extract-json.util';
import { FindingSchema } from '../../graph/utils/parse-llm-analysis.util';


export const PrFindingSchema = FindingSchema.extend({
    filePath: z.string().min(1),
  });
  
  export const PrLlmAnalysisSchema = z.object({
    thoughtProcess: z
      .string()
      .optional()
      .describe('Internal step-by-step reasoning evaluating the PR diff before finalizing findings'),
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