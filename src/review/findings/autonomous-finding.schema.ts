import { z } from 'zod';

export const CandidateFindingSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Full repository relative path to the changed file (e.g. src/auth/auth.service.ts, NEVER just bare filenames like auth.service.ts)',
    ),
  category: z
    .enum([
      'security',
      'correctness',
      'performance',
      'best_practices',
      'maintainability',
    ])
    .describe(
      "The primary category of the finding: 'security' | 'correctness' | 'performance' | 'best_practices' | 'maintainability'",
    ),
  severity: z
    .enum(['critical', 'warning', 'info'])
    .describe(
      "Impact severity: 'critical' for security vulnerabilities, data corruption, or crashes; 'warning' for bugs, edge-case failures, or performance regressions; 'info' for style, consistency, or minor suggestions",
    ),
  title: z
    .string()
    .min(3)
    .describe(
      "Concise 1-line headline summarizing the issue in imperative mood (e.g. 'Unsanitized user input in SQL query')",
    ),
  description: z
    .string()
    .min(10)
    .describe(
      'Detailed explanation of what the problem is, why it occurs, and the potential runtime impact',
    ),
  location: z
    .object({
      startLine: z.coerce
        .number()
        .int()
        .min(1)
        .describe(
          '1-indexed starting line number of the issue in the target file',
        ),
      endLine: z.coerce
        .number()
        .int()
        .min(1)
        .describe(
          '1-indexed ending line number of the issue in the target file',
        ),
    })
    .describe('Line range coordinates where the issue occurs'),
  evidenceSnippet: z
    .string()
    .optional()
    .describe(
      'Exact lines of code quoted verbatim from the file demonstrating the issue',
    ),
  suggestedFix: z
    .string()
    .optional()
    .describe(
      'Concrete, actionable guidance or replacement code explaining how to resolve the finding',
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      "Confidence level: 'high' for verified true positives with clear impact; 'medium' if external context is required; 'low' for speculative items",
    ),
});

export const CandidateFindingsListSchema = z.object({
  thoughtProcess: z
    .string()
    .optional()
    .describe(
      'Investigation reasoning and verification steps taken with tools',
    ),
  candidateFindings: z
    .array(CandidateFindingSchema)
    .describe('List of discovered candidate findings'),
});

export const VerificationResultSchema = z.object({
  status: z
    .enum(['confirmed', 'rejected', 'downgraded'])
    .describe(
      "'confirmed' if the issue is a genuine defect present in the added code; 'rejected' if it is a false positive, already handled, intentional, or references non-existent/unchanged lines; 'downgraded' if valid but lower severity than claimed.",
    ),
  justification: z
    .string()
    .min(10)
    .describe(
      'Concrete technical justification for the verdict, citing line numbers and checks performed.',
    ),
  adjustedSeverity: z
    .enum(['critical', 'warning', 'info'])
    .optional()
    .describe('New severity if status is downgraded'),
  verifiedLine: z.coerce
    .number()
    .int()
    .optional()
    .describe('Confirmed line number where the issue actually exists'),
});

export const AutonomousReviewOutputSchema = z.object({
  summary: z
    .string()
    .min(10)
    .describe(
      'Comprehensive Markdown executive summary of the pull request review highlighting architecture, major risks, critical findings, and merge recommendation',
    ),
  findings: z
    .array(CandidateFindingSchema)
    .describe('Actionable review findings verified against false positives'),
});

export type CandidateFinding = z.infer<typeof CandidateFindingSchema>;
export type CandidateFindingsList = z.infer<typeof CandidateFindingsListSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type AutonomousReviewOutput = z.infer<
  typeof AutonomousReviewOutputSchema
>;

/**
 * Creates a CandidateFindingSchema with filePath constrained to the allowed PR changed files via z.enum.
 * If allowedFilePaths is empty or not provided, falls back to open string matching.
 */
export function createScopedCandidateFindingSchema(
  allowedFilePaths?: string[],
) {
  const valid = Array.from(
    new Set(
      (allowedFilePaths ?? [])
        .filter((p) => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.replace(/\\/g, '/').trim()),
    ),
  );

  const filePathSchema =
    valid.length > 0
      ? z
          .enum([valid[0], ...valid.slice(1)])
          .describe(
            'The exact relative repository path of the changed file in this pull request',
          )
      : z
          .string()
          .min(1)
          .describe(
            'Full repository relative path to the changed file (e.g. src/auth/auth.service.ts, NEVER just bare filenames like auth.service.ts)',
          );

  return CandidateFindingSchema.extend({
    filePath: filePathSchema,
  });
}

/**
 * Creates a CandidateFindingsListSchema with filePath constrained to the allowed PR changed files.
 */
export function createScopedCandidateFindingsListSchema(
  allowedFilePaths?: string[],
) {
  return z.object({
    thoughtProcess: z
      .string()
      .optional()
      .describe(
        'Investigation reasoning and verification steps taken with tools',
      ),
    candidateFindings: z
      .array(createScopedCandidateFindingSchema(allowedFilePaths))
      .describe('List of discovered candidate findings'),
  });
}

/**
 * Creates an AutonomousReviewOutputSchema with filePath constrained to the allowed PR changed files.
 */
export function createScopedAutonomousReviewOutputSchema(
  allowedFilePaths?: string[],
) {
  return z.object({
    summary: z
      .string()
      .min(10)
      .describe(
        'Comprehensive Markdown executive summary of the pull request review highlighting architecture, major risks, critical findings, and merge recommendation',
      ),
    findings: z
      .array(createScopedCandidateFindingSchema(allowedFilePaths))
      .describe('Actionable review findings verified against false positives'),
  });
}
