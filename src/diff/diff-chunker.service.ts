import { Injectable } from '@nestjs/common';

import type { DiffHunk, ParsedDiff } from './types/parsed-diff.types';
import type { FileIndexEntry, ReviewChunk } from './types/review-chunk.types';

@Injectable()
export class DiffChunkerService {
  buildReviewChunks(parsed: ParsedDiff): ReviewChunk[] {
    const chunks: ReviewChunk[] = [];

    for (const file of parsed.files) {
      if (file.patch === null && file.hunks.length === 0) {
        continue;
      }

      for (const hunk of file.hunks) {
        const addedLines = this.getReviewableLines(hunk);
        if (addedLines.length === 0) {
          continue;
        }

        const lineNumbers = addedLines.map((l) => l.line);
        chunks.push({
          filePath: file.filename,
          previousPath: file.previousFilename,
          fileStatus: file.status,
          hunkHeader: hunk.header,
          newLineRange: {
            start: Math.min(...lineNumbers),
            end: Math.max(...lineNumbers),
          },
          addedLines,
          deletedLineCount: hunk.lines.filter((l) => l.type === 'delete').length,
        });
      }
    }

    return chunks;
  }

  buildFileIndex(parsed: ParsedDiff): FileIndexEntry[] {
    return parsed.files.map((file) => ({
      path: file.filename,
      previousPath: file.previousFilename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    }));
  }

  countRemovedOnlyFiles(parsed: ParsedDiff): number {
    return parsed.files.filter(
      (file) =>
        file.status === 'removed' ||
        (file.hunks.length > 0 &&
          file.hunks.every((h) => this.getReviewableLines(h).length === 0)),
    ).length;
  }

  countBinaryOrEmptyFiles(parsed: ParsedDiff): number {
    return parsed.files.filter(
      (file) => file.patch === null && file.hunks.length === 0,
    ).length;
  }

  private getReviewableLines(
    hunk: DiffHunk,
  ): Array<{ line: number; content: string }> {
    return hunk.lines
      .filter(
        (l): l is typeof l & { newLineNumber: number } =>
          l.type === 'add' && l.newLineNumber != null,
      )
      .map((l) => ({
        line: l.newLineNumber,
        content: l.content,
      }));
  }
}
