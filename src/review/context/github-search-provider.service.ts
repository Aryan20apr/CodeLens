import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import {
  GithubApiService,
  type CodeSearchResult,
} from '../../github/github-api.service';
import type { CrossFileHint, CrossFileHintKind } from './cross-file-hint.types';
import type {
  GlobalSearchProvider,
  SymbolSearchOpts,
} from './global-search-provider.interface';

const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_MAX_SNIPPET_CHARS = 400;

@Injectable()
export class GithubSearchProvider implements GlobalSearchProvider {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly github: GithubApiService,
  ) {
    this.logger = logger.child({ context: GithubSearchProvider.name });
  }

  async searchSymbolUsage(
    installationId: bigint,
    repoFullName: string,
    symbol: string,
    opts?: SymbolSearchOpts,
  ): Promise<CrossFileHint> {
    const query = this.buildSymbolQuery(symbol);
    return this.runSearch({
      installationId,
      repoFullName,
      kind: 'symbol_usage',
      query,
      symbol,
      opts,
    });
  }

  async searchImportTarget(
    installationId: bigint,
    repoFullName: string,
    modulePath: string,
    opts?: SymbolSearchOpts,
  ): Promise<CrossFileHint> {
    const query = this.buildImportQuery(modulePath);
    return this.runSearch({
      installationId,
      repoFullName,
      kind: 'import_target',
      query,
      modulePath,
      opts,
    });
  }

  private buildSymbolQuery(symbol: string): string {
    const escaped = symbol.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  private buildImportQuery(modulePath: string): string {
    const base = modulePath.replace(/\.(ts|tsx|js|jsx)$/, '');
    const leaf = base.split('/').pop() ?? base;
    const escaped = leaf.replace(/"/g, '\\"');
    return `"${escaped}" import`;
  }

  private async runSearch(params: {
    installationId: bigint;
    repoFullName: string;
    kind: CrossFileHintKind;
    query: string;
    symbol?: string;
    modulePath?: string;
    opts?: SymbolSearchOpts;
  }): Promise<CrossFileHint> {
    const className = GithubSearchProvider.name;
    const methodName = 'runSearch';
    const { installationId, repoFullName, kind, query, symbol, modulePath, opts } =
      params;

    const perPage = Math.min(opts?.maxResults ?? DEFAULT_MAX_RESULTS, 30);

    try {
      const result = await this.github.searchCode(
        installationId,
        repoFullName,
        query,
        { perPage },
      );

      const hint = this.toHint(result, {
        kind,
        query,
        symbol,
        modulePath,
      });

      this.logger.info(`[${className}] [${methodName}] :: Code search complete`, {
        repoFullName,
        kind,
        pathCount: hint.paths.length,
        totalCount: result.totalCount,
        incomplete: result.incomplete,
      });

      return hint;
    } catch (err) {
      this.logger.warn(`[${className}] [${methodName}] :: Code search failed`, {
        repoFullName,
        kind,
        query,
        error: err,
      });

      return {
        kind,
        query,
        symbol,
        modulePath,
        paths: [],
        snippets: [],
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  private toHint(
    result: CodeSearchResult,
    meta: {
      kind: CrossFileHintKind;
      query: string;
      symbol?: string;
      modulePath?: string;
    },
  ): CrossFileHint {
    const snippets = result.items.map((item) => ({
      path: item.path,
      line: item.line,
      text: item.text.slice(0, DEFAULT_MAX_SNIPPET_CHARS),
    }));

    return {
      kind: meta.kind,
      query: meta.query,
      symbol: meta.symbol,
      modulePath: meta.modulePath,
      paths: [...new Set(snippets.map((s) => s.path))],
      snippets,
      fetchedAt: new Date().toISOString(),
    };
  }
}
