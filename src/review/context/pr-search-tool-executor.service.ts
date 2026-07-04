import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { AppConfig } from '../../config/app-config.types';
import { APP_CONFIG } from '../../config/config.constants';
import type { CrossFileHint } from '../types/cross-file-hint.types';
import { formatHintForToolMessage } from './format-cross-file-hints.util';
import {
  GLOBAL_SEARCH_PROVIDER,
  type GlobalSearchProvider,
} from './global-search-provider.interface';
import { PR_SEARCH_TOOL_NAMES } from './pr-search-tools';
import { GithubApiService } from '../../github/github-api.service';

const PR_FILE_CONTENT_FETCH_CAP = 3;
const MAX_FILE_CONTENT_CHARS = 12_000;

export type PrSearchExecutorContext = {
  installationId: bigint;
  repoFullName: string;
  headSha: string;
  queriesUsed: number;
  fileContentFetched: number;
  cache: Map<string, CrossFileHint>;
};

@Injectable()
export class PrSearchToolExecutorService {
  private readonly logger: Logger;
  private readonly maxQueriesPerRun: number;
  private readonly maxResultsPerQuery: number;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(GLOBAL_SEARCH_PROVIDER) private readonly search: GlobalSearchProvider,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly github: GithubApiService,
  ) {
    this.logger = logger.child({ context: PrSearchToolExecutorService.name });
    this.maxQueriesPerRun = config.prReview.search.maxQueriesPerRun;
    this.maxResultsPerQuery = config.prReview.search.maxResultsPerQuery;
  }

  createContext(
    installationId: bigint,
    repoFullName: string,
    headSha: string,
  ): PrSearchExecutorContext {
    return {
      installationId,
      repoFullName,
      headSha,
      queriesUsed: 0,
      fileContentFetched: 0,
      cache: new Map(),
    };
  }

  async executeToolCall(
    ctx: PrSearchExecutorContext,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ hint: CrossFileHint | null; toolMessage: string }> {
    const className = PrSearchToolExecutorService.name;
    const methodName = 'executeToolCall';

    if (toolName === PR_SEARCH_TOOL_NAMES.fileContent) {
      return this.executeFileContentFetch(ctx, args);
    }

    if (ctx.queriesUsed >= this.maxQueriesPerRun) {
      return {
        hint: null,
        toolMessage: 'Search query cap reached for this review.',
      };
    }

    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    if (ctx.cache.has(cacheKey)) {
      const cached = ctx.cache.get(cacheKey)!;
      return { hint: cached, toolMessage: formatHintForToolMessage(cached) };
    }

    const searchOpts = { maxResults: this.maxResultsPerQuery };

    try {
      let hint: CrossFileHint;

      if (toolName === PR_SEARCH_TOOL_NAMES.symbolUsage) {
        const symbol = typeof args.symbol === 'string' ? args.symbol.trim() : '';
        if (!symbol) {
          return { hint: null, toolMessage: 'Invalid tool args: symbol is required.' };
        }
        hint = await this.search.searchSymbolUsage(
          ctx.installationId,
          ctx.repoFullName,
          symbol,
          searchOpts,
        );
      } else if (toolName === PR_SEARCH_TOOL_NAMES.importTarget) {
        const modulePath =
          typeof args.modulePath === 'string' ? args.modulePath.trim() : '';
        if (!modulePath) {
          return {
            hint: null,
            toolMessage: 'Invalid tool args: modulePath is required.',
          };
        }
        hint = await this.search.searchImportTarget(
          ctx.installationId,
          ctx.repoFullName,
          modulePath,
          searchOpts,
        );
      } else {
        return { hint: null, toolMessage: `Unknown search tool: ${toolName}` };
      }

      ctx.queriesUsed += 1;
      ctx.cache.set(cacheKey, hint);

      this.logger.info(`[${className}] [${methodName}] :: Search tool executed`, {
        repoFullName: ctx.repoFullName,
        toolName,
        pathCount: hint.paths.length,
        queriesUsed: ctx.queriesUsed,
      });

      return { hint, toolMessage: formatHintForToolMessage(hint) };
    } catch (err) {
      this.logger.warn(`[${className}] [${methodName}] :: Search tool failed`, {
        repoFullName: ctx.repoFullName,
        toolName,
        error: err,
      });
      return {
        hint: null,
        toolMessage: 'Code search failed for this query. Continue without cross-file hints.',
      };
    }
  }

  private async executeFileContentFetch(
    ctx: PrSearchExecutorContext,
    args: Record<string, unknown>,
  ): Promise<{ hint: CrossFileHint | null; toolMessage: string }> {
    const className = PrSearchToolExecutorService.name;
    const methodName = 'executeFileContentFetch';

    const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
    if (!filePath) {
      return { hint: null, toolMessage: 'Invalid tool args: filePath is required.' };
    }

    if (ctx.fileContentFetched >= PR_FILE_CONTENT_FETCH_CAP) {
      return {
        hint: null,
        toolMessage: `File content fetch cap (${PR_FILE_CONTENT_FETCH_CAP}) reached for this review.`,
      };
    }

    try {
      const fetched = await this.github.getFileContentAtRef(
        ctx.installationId,
        ctx.repoFullName,
        filePath,
        ctx.headSha,
      );

      if (!fetched) {
        return { hint: null, toolMessage: `File not found: ${filePath}` };
      }

      ctx.fileContentFetched += 1;

      const content = fetched.content.slice(0, MAX_FILE_CONTENT_CHARS);
      const truncated = fetched.content.length > MAX_FILE_CONTENT_CHARS;
      const truncationNote = truncated
        ? `\n[Truncated — showing first ${MAX_FILE_CONTENT_CHARS} chars of ${fetched.content.length}]`
        : '';

      this.logger.info(`[${className}] [${methodName}] :: File content fetched`, {
        repoFullName: ctx.repoFullName,
        filePath,
        sizeBytes: fetched.sizeBytes,
        truncated,
        fileContentFetched: ctx.fileContentFetched,
      });

      return {
        hint: null,
        toolMessage: `### ${filePath}\n\`\`\`\n${content}\n\`\`\`${truncationNote}`,
      };
    } catch (err) {
      this.logger.warn(`[${className}] [${methodName}] :: File content fetch failed`, {
        repoFullName: ctx.repoFullName,
        filePath,
        error: err,
      });
      return {
        hint: null,
        toolMessage: `Failed to fetch file content for ${filePath}. Continue without it.`,
      };
    }
  }
}