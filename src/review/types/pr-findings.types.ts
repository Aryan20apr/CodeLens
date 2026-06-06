import { ReviewChunk, FileIndexEntry } from 'src/diff/types/review-chunk.types';
import type { Finding, FindingSeverity } from '../../graph/state.types';
import { CrossFileHint } from './cross-file-hint.types';

export type FindingDropReason =
  | 'missing_file_path'
  | 'line_not_in_diff'
  | 'invalid_line_range'
  | 'cross_file_unsupported'
  | 'low_confidence'
  | 'severity_filtered'
  | 'per_file_cap'
  | 'global_cap'
  | 'duplicate_path_line';

export type ValidationStats = {
  rawCount: number;
  validCount: number;
  droppedCount: number;
  dropReasons: Partial<Record<FindingDropReason, number>>;
};

export type ValidatePrFindingsInput = {
  rawFindings: Finding[];
  analysisSummary: string;
  chunks: ReviewChunk[];
  fileIndex: FileIndexEntry[];
  crossFileHints: CrossFileHint[];
  config: {
    maxInlineComments: number;
    maxPerFile: number;
    minConfidence: 'low' | 'medium' | 'high';
    allowedSeverities: FindingSeverity[];
  };
};

export type ValidatePrFindingsResult = {
  validatedFindings: Finding[];
  validationStats: ValidationStats;
};

export type GithubReviewCommentInput = {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
  start_line?: number;
  start_side?: 'RIGHT';
};
