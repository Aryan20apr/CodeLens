export type DiffLineType = 'context' | 'add' | 'delete';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export type FileDiffStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied';

export interface FileDiff {
  filename: string;
  previousFilename: string | null;
  status: FileDiffStatus;
  additions: number;
  deletions: number;
  patch: string | null;
  hunks: DiffHunk[];
}

export interface ParsedDiff {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}
