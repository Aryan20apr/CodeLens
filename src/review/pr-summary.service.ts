import { Inject, Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { DiffChunkSerializerService } from '../diff/diff-chunk-serializer.service';
import type { ParsedDiff } from '../diff/types/parsed-diff.types';
import type { FileIndexEntry, ReviewChunk } from '../diff/types/review-chunk.types';
import { LlmService } from '../llm/llm.service';

export type PrSummaryInput = {
  repoFullName: string;
  prNumber: number;
  title: string;
  body: string | null;
  parsed: ParsedDiff;
  chunks: ReviewChunk[];
  fileIndex: FileIndexEntry[];
  removedOnlyFileCount: number;
  binaryOrEmptyFileCount: number;
  diffTruncated?: boolean;
  apiFileIndex?: FileIndexEntry[];
};

const SYSTEM_PROMPT = `You are CodeLens, a precise pull-request review assistant.
Review ONLY the provided diff chunk blocks below. Do not invent files or line numbers.
Each finding MUST cite a path and a 1-based line number from the "Added lines" sections (format: L{n}).
Comment only on added lines shown in the chunks. Do not cite deleted-only lines.
If uncertain about a finding, omit it rather than guess.

Output markdown with these sections:
## Overview
2-4 sentences on the PR as a whole.

## Findings by file
Group under ### path/to/file headers. Use bullets: - **L42** — description (optional severity: critical/warning/info).

## Risks
## Suggested follow-ups

Do not use GitHub inline review comment syntax. Output is the PR review body only.`;

@Injectable()
export class PrSummaryService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly llm: LlmService,
    private readonly serializer: DiffChunkSerializerService,
  ) {
    this.logger = logger.child({ context: PrSummaryService.name });
  }

  async summarize(input: PrSummaryInput): Promise<string> {
    const className = PrSummaryService.name;
    const methodName = 'summarize';

    const { text: serializedChunks, truncated } =
      this.serializer.serializeChunks(input.chunks);

    const addedLineCount = input.chunks.reduce(
      (sum, c) => sum + c.addedLines.length,
      0,
    );

    this.logger.info(`[${className}] [${methodName}] :: Generating PR summary`, {
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
      fileCount: input.parsed.files.length,
      chunkCount: input.chunks.length,
      addedLineCount,
      truncated,
      diffTruncated: input.diffTruncated ?? false,
    });

    const model = this.llm.getChatModel();
    const description = (input.body ?? '').slice(0, 8_000);

    const fileIndexLines = this.formatFileIndex(
      input.apiFileIndex ?? input.fileIndex,
    );

    const truncationParts: string[] = [];
    if (input.diffTruncated) {
      truncationParts.push(
        'The unified diff was truncated before parsing; the file index may include files beyond the chunks below.',
      );
    }
    if (truncated) {
      if (truncated.chunksOmitted > 0) {
        truncationParts.push(
          `${truncated.chunksOmitted} hunk(s) omitted from the review payload due to size limits.`,
        );
      }
      if (truncated.linesOmitted > 0) {
        truncationParts.push(
          `${truncated.linesOmitted} added line(s) truncated within included hunks.`,
        );
      }
    }

    const statsBlock = [
      `Files changed: ${input.parsed.files.length}`,
      `Reviewable hunks: ${input.chunks.length}`,
      `Added lines in chunks: ${addedLineCount}`,
      input.removedOnlyFileCount > 0
        ? `Files removed or deletion-only (no added lines to cite): ${input.removedOnlyFileCount}`
        : '',
      input.binaryOrEmptyFileCount > 0
        ? `Binary or empty patches skipped: ${input.binaryOrEmptyFileCount}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const userContent = [
      `Repository: ${input.repoFullName}`,
      `PR #${input.prNumber}`,
      `Title: ${input.title}`,
      description ? `Description:\n${description}` : '',
      `\n## Changed files\n${fileIndexLines}`,
      `\n## Stats\n${statsBlock}`,
      truncationParts.length > 0
        ? `\n## Truncation\n${truncationParts.join('\n')}`
        : '',
      `\n## Diff chunks\n${serializedChunks}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const response = await model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(userContent),
      ]);

      const text =
        typeof response.content === 'string'
          ? response.content
          : Array.isArray(response.content)
            ? response.content
                .map((c) =>
                  typeof c === 'string'
                    ? c
                    : 'text' in c
                      ? String(c.text)
                      : '',
                )
                .join('')
            : String(response.content ?? '');

      if (!text.trim()) {
        this.logger.error(
          `[${className}] [${methodName}] :: LLM returned empty PR summary`,
          {
            repoFullName: input.repoFullName,
            prNumber: input.prNumber,
          },
        );
        throw new Error('LLM returned empty PR summary');
      }

      const summary = text.trim();

      this.logger.info(`[${className}] [${methodName}] :: PR summary generated`, {
        repoFullName: input.repoFullName,
        prNumber: input.prNumber,
        summaryChars: summary.length,
      });

      return summary;
    } catch (err) {
      this.logger.error(
        `[${className}] [${methodName}] :: Failed to generate PR summary`,
        {
          repoFullName: input.repoFullName,
          prNumber: input.prNumber,
          error: err,
        },
      );
      throw err;
    }
  }

  private formatFileIndex(entries: FileIndexEntry[]): string {
    if (entries.length === 0) {
      return '(no files listed)';
    }
    return entries
      .map((f) => {
        const rename =
          f.previousPath && f.previousPath !== f.path
            ? ` (renamed from ${f.previousPath})`
            : '';
        return `- ${f.path} [${f.status}] +${f.additions}/-${f.deletions}${rename}`;
      })
      .join('\n');
  }
}
