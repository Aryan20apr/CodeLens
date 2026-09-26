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
  category: z
    .enum([
      "security",
      "correctness",
      "performance",
      "best_practices",
      "maintainability",
    ])
    .describe("The primary category of the finding"),

  severity: z
    .enum([
      "critical",
      "warning",
      "info",
    ])
    .describe(
      "Impact severity: 'critical' for security vulnerabilities, data corruption, or crashes; 'warning' for bugs, edge-case failures, or performance regressions; 'info' for style, consistency, or minor suggestions"
    ),

  title: z
    .string()
    .min(3)
    .describe(
      "Concise 1-line headline summarizing the issue in imperative mood (e.g. 'Unsanitized user input in SQL query')"
    ),

  description: z
    .string()
    .min(10)
    .describe(
      "Detailed explanation of what the problem is, why it occurs, and the potential runtime impact"
    ),

  location: z
    .object({
      startLine: z
        .number()
        .int()
        .min(1)
        .describe("1-indexed starting line number of the issue in the target file"),
      endLine: z
        .number()
        .int()
        .min(1)
        .describe("1-indexed ending line number of the issue in the target file"),
    })
    .describe("Line range coordinates where the issue occurs"),

  evidenceSnippet: z
    .string()
    .optional()
    .describe(
      "Exact lines of code quoted verbatim from the file demonstrating the issue. Do not wrap in markdown code fences"
    ),

  suggestedFix: z
    .string()
    .optional()
    .describe(
      "Concrete, actionable guidance or replacement code explaining how to resolve the finding"
    ),

  confidence: z
    .enum([
      "high",
      "medium",
      "low",
    ])
    .describe(
      "Confidence level: 'high' for verified true positives with clear impact; 'medium' if external context or caller assumptions are required; 'low' for speculative items"
    ),
});

export const LlmAnalysisSchema = z.object({
  thoughtProcess: z
    .string()
    .optional()
    .describe(
      "Step-by-step reasoning analyzing the code, validating potential issues, and filtering false positives before finalizing findings"
    ),

  summary: z
    .string()
    .min(10)
    .describe("Executive summary of the review assessing overall code health, risk, and key themes"),

  findings: z
    .array(FindingSchema)
    .max(25)
    .describe("List of identified issues ordered from highest severity to lowest"),
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