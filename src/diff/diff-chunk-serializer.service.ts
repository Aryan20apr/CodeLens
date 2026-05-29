import { Injectable } from '@nestjs/common';

import type { ReviewChunk } from './types/review-chunk.types';

export const MAX_REVIEW_CHUNKS = 80;
export const MAX_ADDED_LINES_PER_CHUNK = 60;

export type ChunkSerializationResult = {
  text: string;
  truncated: {
    chunksOmitted: number;
    linesOmitted: number;
  } | null;
  chunksIncluded: number;
};

@Injectable()
export class DiffChunkSerializerService {
  private lastTruncation: ChunkSerializationResult['truncated'] = null;

  getTruncationMeta(): ChunkSerializationResult['truncated'] {
    return this.lastTruncation;
  }

  serializeChunks(chunks: ReviewChunk[]): ChunkSerializationResult {
    let chunksOmitted = 0;
    let linesOmitted = 0;

    const included = chunks.slice(0, MAX_REVIEW_CHUNKS);
    if (chunks.length > MAX_REVIEW_CHUNKS) {
      chunksOmitted = chunks.length - MAX_REVIEW_CHUNKS;
    }

    const blocks: string[] = [];

    for (const chunk of included) {
      const { block, omittedLines } = this.formatChunk(chunk);
      linesOmitted += omittedLines;
      blocks.push(block);
    }

    let text = blocks.join('\n\n');

    if (chunksOmitted > 0) {
      text += `\n\n[${chunksOmitted} hunk(s) omitted due to size limit.]`;
    }

    this.lastTruncation =
      chunksOmitted > 0 || linesOmitted > 0
        ? { chunksOmitted, linesOmitted }
        : null;

    return {
      text,
      truncated: this.lastTruncation,
      chunksIncluded: included.length,
    };
  }

  private formatChunk(chunk: ReviewChunk): {
    block: string;
    omittedLines: number;
  } {
    const statusLabel = chunk.previousPath
      ? `${chunk.fileStatus}, was ${chunk.previousPath}`
      : chunk.fileStatus;

    const lines = chunk.addedLines;
    const truncated = lines.length > MAX_ADDED_LINES_PER_CHUNK;
    const visible = truncated
      ? lines.slice(0, MAX_ADDED_LINES_PER_CHUNK)
      : lines;
    const omittedLines = truncated
      ? lines.length - MAX_ADDED_LINES_PER_CHUNK
      : 0;

    const addedBlock = visible
      .map((l) => `  L${l.line}: +${l.content}`)
      .join('\n');

    const deleteNote =
      chunk.deletedLineCount > 0
        ? `\n(${chunk.deletedLineCount} line(s) removed in this hunk — do not cite removed lines.)`
        : '';

    const truncateNote = truncated
      ? `\n[${omittedLines} added line(s) truncated in this hunk.]`
      : '';

    const block = [
      `### ${chunk.filePath} (${statusLabel}) — ${chunk.hunkHeader}`,
      `Added lines (cite these line numbers only):${deleteNote}`,
      addedBlock,
      truncateNote,
    ]
      .filter(Boolean)
      .join('\n');

    return { block, omittedLines };
  }
}
