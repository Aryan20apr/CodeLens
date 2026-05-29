import type { ParsedDiff } from '../diff/types/parsed-diff.types';
import type { ReviewChunk } from '../diff/types/review-chunk.types';

/**
 * Initial Graph state types for the snippet path.
 * PR path uses PrReviewSource internally (not LangGraph in Phase 1).
 */
export type PrReviewSource = {
  type: 'pr';
  repoFullName: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  diffText: string;
  parsed?: ParsedDiff;
  chunks?: ReviewChunk[];
};

export type SnippetSource = {
  type: 'snippet';
  language: string;
  code: string;
  filename?: string;
};

export type CodeSymbol = {
  name: string;
  startLine: number;
  endLine: number;
};

export type CodeMetadata = {
  // always available
  linesOfCode: number;

  // extracted via Tree-sitter queries (language agnostic)
  functions: CodeSymbol[];
  classes: CodeSymbol[];
  imports: string[];
  entryPoints: string[];

  functionCount: number;
  classCount: number;
  importCount: number;

  /**
   * Complexity is optional in Tree-sitter mode.
   * Set to 0 (or null) until you implement a language-specific / generic approximation.
   */
  maxCyclomaticComplexity: number | null;
  averageCyclomaticComplexity: number | null;
};

export type ParseStatus = 'pending' | 'parsing' | 'complete' | 'failed';

export type FindingSeverity = 'critical' | 'warning' | 'info';
export type FindingCategory =
  | 'security'
  | 'correctness'
  | 'performance'
  | 'best_practices'
  | 'maintainability';

export type CodeLocation = {
  // 1-based
  startLine: number;
  endLine: number;
};

export type Finding = {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  location: CodeLocation;
  evidenceSnippet?: string;
  suggestedFix?: string;

  /**
   * Useful when skipping static analysis.
   */
  confidence: 'high' | 'medium' | 'low';
};
export type LlmAnalysis = {
  summary: string;
  findings: Finding[];
};

export type Score = {
  overall: number; // 0..100
  categories: Record<FindingCategory, number>; // 0..100
};

export type StructuredReport = {
  summary: string;
  score: Score;
  findings: Finding[];
  metadata: CodeMetadata | null;
  language: string | null;
};

export type QualityGateResult = {
  passed: boolean;
  reason: string;
};
