// src/graph/utils/parse-llm-analysis.util.ts

import { randomUUID } from "crypto";
import { z } from "zod";

import type { LlmAnalysis } from "../state.types";

import { extractJson } from "./extract-json.util";

/**
 * Centralized schema for ALL LLM analysis outputs.
 *
 * MUST use this parser to avoid schema drift.
 */

export const FindingSchema = z.object({
  category: z.enum([
    "security",
    "correctness",
    "performance",
    "best_practices",
    "maintainability",
  ]),

  severity: z.enum([
    "critical",
    "warning",
    "info",
  ]),

  title: z.string().min(3),

  description: z.string().min(10),

  location: z.object({
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
  }),

  evidenceSnippet: z.string().optional(),

  suggestedFix: z.string().optional(),

  confidence: z.enum([
    "high",
    "medium",
    "low",
  ]),
});

export const LlmAnalysisSchema = z.object({
  summary: z.string().min(10),

  findings: z.array(FindingSchema)
    .max(25),
});

type LlmAnalysisOut = z.infer<
  typeof LlmAnalysisSchema
>;

/**
 * Parse + validate + normalize
 * all LLM analysis responses.
 */
export function parseLlmAnalysis(
  raw: string,
): LlmAnalysis {
  let parsed: unknown;

  try {
    parsed = JSON.parse(
      extractJson(raw),
    );
  } catch {
    throw new Error(
      "LLM did not return valid JSON",
    );
  }

  const validated: LlmAnalysisOut =
    LlmAnalysisSchema.parse(parsed);

  return {
    summary: validated.summary,

    findings: validated.findings.map(
      (finding) => ({
        id: randomUUID(),
        ...finding,
      }),
    ),
  };
}