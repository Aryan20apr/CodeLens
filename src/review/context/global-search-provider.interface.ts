import type { CrossFileHint } from './cross-file-hint.types';

export type SymbolSearchOpts = { maxResults?: number };

export interface GlobalSearchProvider {
  searchSymbolUsage(
    installationId: bigint,
    repoFullName: string,
    symbol: string,
    opts?: SymbolSearchOpts,
  ): Promise<CrossFileHint>;

  searchImportTarget(
    installationId: bigint,
    repoFullName: string,
    modulePath: string,
    opts?: SymbolSearchOpts,
  ): Promise<CrossFileHint>;
}

export const GLOBAL_SEARCH_PROVIDER = Symbol('GLOBAL_SEARCH_PROVIDER');