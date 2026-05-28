import { Injectable } from '@nestjs/common';

import type {
  DiffHunk,
  DiffLine,
  DiffLineType,
  FileDiff,
  FileDiffStatus,
  ParsedDiff,
} from './types/parsed-diff.types';

const HUNK_HEADER =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

@Injectable()
export class DiffParserService {
  parse(rawDiff: string): ParsedDiff {
    const files: FileDiff[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    const fileBlocks = this.splitFileBlocks(rawDiff);

    for (const block of fileBlocks) {
      const file = this.parseFileBlock(block);
      if (!file) continue;
      files.push(file);
      totalAdditions += file.additions;
      totalDeletions += file.deletions;
    }

    return { files, totalAdditions, totalDeletions };
  }

  private splitFileBlocks(raw: string): string[] {
    const lines = raw.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];

    for (const line of lines) {
      if (line.startsWith('diff --git ') && current.length > 0) {
        blocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) {
      blocks.push(current.join('\n'));
    }

    if (blocks.length === 0 && raw.trim()) {
      return [raw];
    }

    return blocks;
  }

  private parseFileBlock(block: string): FileDiff | null {
    const lines = block.split('\n');
    let filename = '';
    let previousFilename: string | null = null;
    let status: FileDiffStatus = 'modified';
    const patchLines: string[] = [];
    const hunks: DiffHunk[] = [];

    let oldLine = 0;
    let newLine = 0;
    let currentHunk: DiffHunk | null = null;
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git ')) {
        const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (match) {
          filename = match[2];
          if (match[1] !== match[2]) {
            previousFilename = match[1];
            status = 'renamed';
          }
        }
        continue;
      }
      if (line.startsWith('new file mode')) {
        status = 'added';
        continue;
      }
      if (line.startsWith('deleted file mode')) {
        status = 'removed';
        continue;
      }
      if (line.startsWith('rename from ')) {
        previousFilename = line.slice('rename from '.length);
        status = 'renamed';
        continue;
      }
      if (line.startsWith('rename to ')) {
        filename = line.slice('rename to '.length);
        continue;
      }
      if (line.startsWith('copy from ')) {
        status = 'copied';
        continue;
      }
      if (
        line.startsWith('index ') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ')
      ) {
        patchLines.push(line);
        continue;
      }

      const hunkMatch = line.match(HUNK_HEADER);
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk);
        const oldStart = Number(hunkMatch[1]);
        const oldLines = Number(hunkMatch[2] ?? '1');
        const newStart = Number(hunkMatch[3]);
        const newLines = Number(hunkMatch[4] ?? '1');
        oldLine = oldStart;
        newLine = newStart;
        currentHunk = {
          header: line,
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: [],
        };
        patchLines.push(line);
        continue;
      }

      if (!currentHunk) {
        patchLines.push(line);
        continue;
      }

      patchLines.push(line);
      const parsed = this.parseDiffLine(line, oldLine, newLine);
      if (!parsed) continue;

      currentHunk.lines.push(parsed.line);
      oldLine = parsed.oldLine;
      newLine = parsed.newLine;

      if (parsed.line.type === 'add') additions += 1;
      if (parsed.line.type === 'delete') deletions += 1;
    }

    if (currentHunk) hunks.push(currentHunk);

    if (!filename && hunks.length === 0 && patchLines.length === 0) {
      return null;
    }

    if (!filename && patchLines.length > 0) {
      const plus = patchLines.find((l) => l.startsWith('+++ b/'));
      if (plus) filename = plus.slice('+++ b/'.length);
    }

    return {
      filename: filename || 'unknown',
      previousFilename,
      status,
      additions,
      deletions,
      patch: patchLines.length > 0 ? patchLines.join('\n') : null,
      hunks,
    };
  }

  private parseDiffLine(
    line: string,
    oldLine: number,
    newLine: number,
  ): { line: DiffLine; oldLine: number; newLine: number } | null {
    if (line === '\\ No newline at end of file') {
      return null;
    }

    let type: DiffLineType;
    let content: string;

    if (line.startsWith('+')) {
      type = 'add';
      content = line.slice(1);
      const result: DiffLine = {
        type,
        content,
        oldLineNumber: null,
        newLineNumber: newLine,
      };
      return { line: result, oldLine, newLine: newLine + 1 };
    }

    if (line.startsWith('-')) {
      type = 'delete';
      content = line.slice(1);
      const result: DiffLine = {
        type,
        content,
        oldLineNumber: oldLine,
        newLineNumber: null,
      };
      return { line: result, oldLine: oldLine + 1, newLine };
    }

    if (line.startsWith(' ')) {
      type = 'context';
      content = line.slice(1);
      const result: DiffLine = {
        type,
        content,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      };
      return {
        line: result,
        oldLine: oldLine + 1,
        newLine: newLine + 1,
      };
    }

    return null;
  }
}
