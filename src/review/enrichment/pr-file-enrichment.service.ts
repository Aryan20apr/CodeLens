import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { ReviewChunk } from '../../diff/types/review-chunk.types';
import { AstExtractService } from '../../graph/lib/ast-extract.service';
import { LanguageDetectService } from '../../graph/lib/language-detect.service';
import { GithubApiService } from '../../github/github-api.service';
import { mapAddedLinesToSymbols } from './map-added-lines-to-symbols.util';
import type {
  PrFileContext,
  PrFileEnrichmentInput,
  PrFileEnrichmentResult,
  PrFileEnrichSkipReason,
} from './pr-file-enrichment.types';

export const MAX_ENRICH_FILES = 50;
export const MAX_FILE_BYTES = 512_000;
export const ENRICH_CONCURRENCY = 5;

@Injectable()
export class PrFileEnrichmentService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly github: GithubApiService,
    private readonly language: LanguageDetectService,
    private readonly astExtract: AstExtractService,
  ) {
    this.logger = logger.child({ context: PrFileEnrichmentService.name });
  }

  async enrich(input: PrFileEnrichmentInput): Promise<PrFileEnrichmentResult> {
    const className = PrFileEnrichmentService.name;
    const methodName = 'enrich';

    const paths = this.uniqueFilePaths(input.chunks).slice(0, MAX_ENRICH_FILES);
    const addedLinesByPath = this.collectAddedLinesByPath(input.chunks);

    this.logger.info(`[${className}] [${methodName}] :: Starting file enrichment`, {
      repoFullName: input.repoFullName,
      headSha: input.headSha,
      fileCount: paths.length,
    });

    const fileContexts: PrFileContext[] = [];
    let enrichedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < paths.length; i += ENRICH_CONCURRENCY) {
      const batch = paths.slice(i, i + ENRICH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((filePath) =>
          this.enrichOneFile(
            input.installationId,
            input.repoFullName,
            input.headSha,
            filePath,
            addedLinesByPath.get(filePath) ?? [],
          ),
        ),
      );
      for (const ctx of batchResults) {
        fileContexts.push(ctx);
        if (ctx.fetchStatus === 'ok') enrichedCount += 1;
        else if (ctx.fetchStatus === 'skipped') skippedCount += 1;
        else failedCount += 1;
      }
    }

    this.logger.info(`[${className}] [${methodName}] :: File enrichment complete`, {
      repoFullName: input.repoFullName,
      enrichedCount,
      skippedCount,
      failedCount,
    });

    return { fileContexts, enrichedCount, skippedCount, failedCount };
  }

  private uniqueFilePaths(chunks: ReviewChunk[]): string[] {
    return [...new Set(chunks.map((c) => c.filePath))];
  }

  private collectAddedLinesByPath(chunks: ReviewChunk[]): Map<string, number[]> {
    const map = new Map<string, Set<number>>();
    for (const chunk of chunks) {
      let set = map.get(chunk.filePath);
      if (!set) {
        set = new Set();
        map.set(chunk.filePath, set);
      }
      for (const line of chunk.addedLines) {
        set.add(line.line);
      }
    }
    const result = new Map<string, number[]>();
    for (const [path, lines] of map) {
      result.set(path, [...lines].sort((a, b) => a - b));
    }
    return result;
  }

  private async enrichOneFile(
    installationId: bigint,
    repoFullName: string,
    headSha: string,
    filePath: string,
    addedLines: number[],
  ): Promise<PrFileContext> {
    const className = PrFileEnrichmentService.name;
    const methodName = 'enrichOneFile';

    const fetched = await this.github.getFileContentAtRef(
      installationId,
      repoFullName,
      filePath,
      headSha,
    );

    if (!fetched) {
      return this.skippedContext(filePath, 'unknown', 'failed', 'not_found', addedLines);
    }

    if (fetched.sizeBytes > MAX_FILE_BYTES) {
      return this.skippedContext(
        filePath,
        'unknown',
        'skipped',
        'file_too_large',
        addedLines,
      );
    }

    const detected = this.language.detectLanguage(fetched.content, filePath);
    if (detected === 'unknown') {
      return this.skippedContext(
        filePath,
        detected,
        'skipped',
        'unsupported_language',
        addedLines,
      );
    }

    try {
      const metadata = await this.astExtract.buildMetadata(
        fetched.content,
        detected,
      );
      const addedLineSymbols = mapAddedLinesToSymbols(
        addedLines,
        metadata.functions,
        metadata.classes,
      );

      this.logger.debug(
        `[${className}] [${methodName}] :: Enriched file`,
        {
          filePath,
          language: detected,
          functionCount: metadata.functionCount,
        },
      );

      return {
        filePath,
        language: detected,
        fetchStatus: 'ok',
        metadata,
        addedLineSymbols,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      this.logger.warn(
        `[${className}] [${methodName}] :: AST enrichment failed`,
        { filePath, errorMessage, errorStack },
      );
      return this.skippedContext(
        filePath,
        detected,
        'failed',
        'ast_error',
        addedLines,
      );
    }
  }

  private skippedContext(
    filePath: string,
    language: string,
    fetchStatus: 'skipped' | 'failed',
    skipReason: PrFileEnrichSkipReason,
    addedLines: number[],
  ): PrFileContext {
    return {
      filePath,
      language,
      fetchStatus,
      skipReason,
      metadata: null,
      addedLineSymbols: addedLines.map((line) => ({
        line,
        symbolKind: null,
        symbolName: null,
      })),
    };
  }
}
