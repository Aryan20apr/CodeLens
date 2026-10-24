import type { ReviewChunk } from '../../diff/types/review-chunk.types';
import type { CodeMetadata } from '../../graph/state.types';

export type PrFileEnrichSkipReason =
  | 'unsupported_language'
  | 'file_too_large'
  | 'not_found'
  | 'not_a_file'
  | 'fetch_error'
  | 'ast_error';

export type AddedLineSymbolRef = {
  line: number;
  symbolKind: 'function' | 'class' | null;
  symbolName: string | null;
};

export type PrFileContext = {
  filePath: string;
  language: string;
  fetchStatus: 'ok' | 'skipped' | 'failed';
  skipReason?: PrFileEnrichSkipReason;
  metadata: CodeMetadata | null;
  addedLineSymbols: AddedLineSymbolRef[];
};

export type PrFileEnrichmentInput = {
  installationId: bigint;
  repoFullName: string;
  headSha: string;
  chunks: ReviewChunk[];
};

export type PrFileEnrichmentResult = {
  fileContexts: PrFileContext[];
  enrichedCount: number;
  skippedCount: number;
  failedCount: number;
};
