import type { FileDiffStatus } from './parsed-diff.types';

export type ReviewChunk = {
  filePath: string;
  previousPath: string | null;
  fileStatus: FileDiffStatus;
  hunkHeader: string;
  newLineRange: { start: number; end: number } | null;
  addedLines: Array<{ line: number; content: string }>;
  deletedLineCount: number;
};

export type FileIndexEntry = {
  path: string;
  previousPath: string | null;
  status: FileDiffStatus;
  additions: number;
  deletions: number;
};
