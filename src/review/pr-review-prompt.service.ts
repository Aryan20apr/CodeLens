import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { DiffChunkSerializerService } from '../diff/diff-chunk-serializer.service';
import type { ParsedDiff } from '../diff/types/parsed-diff.types';
import type { FileIndexEntry, ReviewChunk } from '../diff/types/review-chunk.types';
import { formatFileContextsForPrompt } from './enrichment/format-file-context.util';
import type { PrFileContext } from './types/pr-file-enrichment.types';
import { PromptRegistryService } from '../prompts/prompt-registry.service';
import type { LlmProviderName } from '../prompts/types/prompt.types';

export type PrReviewPromptInput = {
  repoFullName: string;
  prNumber: number;
  title: string;
  body: string | null;
  parsed: ParsedDiff | null;
  chunks: ReviewChunk[];
  fileIndex: FileIndexEntry[];
  removedOnlyFileCount: number;
  binaryOrEmptyFileCount: number;
  diffTruncated?: boolean;
  apiFileIndex?: FileIndexEntry[];
  fileContexts?: PrFileContext[];
  searchEnabled?: boolean;
  enrichedFileCount?: number;
  provider?: LlmProviderName;
};

export type PrReviewPromptBundle = {
  systemPrompt: string;
  userContent: string;
  skipSearchTools: boolean;
};

@Injectable()
export class PrReviewPromptService {
  private readonly logger: Logger;
  private readonly searchConfig: AppConfig['prReview']['search'];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly serializer: DiffChunkSerializerService,
    private readonly promptRegistry: PromptRegistryService,
  ) {
    this.logger = logger.child({ context: PrReviewPromptService.name });
    this.searchConfig = config.prReview.search;
  }

  shouldSkipSearchTools(input: PrReviewPromptInput): boolean {
    if (!this.searchConfig.enabled || input.searchEnabled === false) {
      return true;
    }
    if (input.chunks.length === 0) {
      return true;
    }
    if ((input.enrichedFileCount ?? 0) === 0) {
      return true;
    }
    const fileCount = new Set(input.chunks.map((c) => c.filePath)).size;
    const addedLines = input.chunks.reduce((n, c) => n + c.addedLines.length, 0);
    if (fileCount === 1 && addedLines < 30) {
      return true;
    }
    return false;
  }

  build(input: PrReviewPromptInput): PrReviewPromptBundle {
    const className = PrReviewPromptService.name;
    const methodName = 'build';

    const { text: serializedChunks, truncated } =
      this.serializer.serializeChunks(input.chunks);

    const skipSearchTools = this.shouldSkipSearchTools(input);

    this.logger.info(`[${className}] [${methodName}] :: Built PR review prompt`, {
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
      chunkCount: input.chunks.length,
      skipSearchTools,
    });

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

    const addedLineCount = input.chunks.reduce(
      (sum, c) => sum + c.addedLines.length,
      0,
    );

    const statsBlock = [
      `Files changed: ${input.parsed?.files.length}`,
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
      `\n## Structural context (AST at head; do not cite lines from here unless in chunks)\n${formatFileContextsForPrompt(input.fileContexts ?? [])}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const rendered = this.promptRegistry.render(
      'pr-review.single',
      { skipSearchTools },
      { provider: input.provider },
    );
    const systemPrompt = rendered.systemPrompt;

    return { systemPrompt, userContent, skipSearchTools };
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
