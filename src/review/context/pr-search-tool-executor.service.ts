import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { AppConfig } from '../../config/app-config.types';
import { APP_CONFIG } from '../../config/config.constants';
import type { CrossFileHint } from './cross-file-hint.types';
import { formatHintForToolMessage } from './format-cross-file-hints.util';
import {
  GLOBAL_SEARCH_PROVIDER,
  type GlobalSearchProvider,
} from './global-search-provider.interface';
import { PR_SEARCH_TOOL_NAMES } from './pr-search-tools';

export type PrSearchExecutorContext = {
  installationId: bigint;
  repoFullName: string;
  queriesUsed: number;
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
  ) {
    this.logger = logger.child({ context: PrSearchToolExecutorService.name });
    this.maxQueriesPerRun = config.prReview.search.maxQueriesPerRun;
    this.maxResultsPerQuery = config.prReview.search.maxResultsPerQuery;
  }

  createContext(installationId: bigint, repoFullName: string): PrSearchExecutorContext {
    return {
      installationId,
      repoFullName,
      queriesUsed: 0,
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
}
