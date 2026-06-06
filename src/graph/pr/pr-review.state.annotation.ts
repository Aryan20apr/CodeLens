import { Annotation, MemorySaver } from '@langchain/langgraph';

import type { ParsedDiff } from '../../diff/types/parsed-diff.types';
import type {
  FileIndexEntry,
  ReviewChunk,
} from '../../diff/types/review-chunk.types';
import {
  appendEvents,
  firstWriteWins,
  lastWins,
  type GraphEvent,
} from '../state.annotation';
import type { PrFileContext } from '../../review/types/pr-file-enrichment.types';
import type { PrReviewRunStatus } from '../state.types';
import type { CrossFileHint } from '../../review/types/cross-file-hint.types';
import type { Finding } from '../state.types';
import type { ValidationStats } from '../../review/types/pr-findings.types';


export const PrReviewGraphState = Annotation.Root({
  reviewRunId: Annotation<string>({
    reducer: firstWriteWins,
    default: () => '',
  }),
  installationId: Annotation<string>({
    reducer: firstWriteWins,
    default: () => '',
  }),
  repoFullName: Annotation<string>({
    reducer: firstWriteWins,
    default: () => '',
  }),
  prNumber: Annotation<number>({
    reducer: firstWriteWins,
    default: () => 0,
  }),
  headSha: Annotation<string>({
    reducer: firstWriteWins,
    default: () => '',
  }),
  baseSha: Annotation<string>({
    reducer: firstWriteWins,
    default: () => '',
  }),

  prTitle: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),
  prBody: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),

  diffText: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),
  diffTruncated: Annotation<boolean>({
    reducer: lastWins,
    default: () => false,
  }),
  apiFileIndex: Annotation<FileIndexEntry[] | undefined>({
    reducer: lastWins,
    default: () => undefined,
  }),

  parsed: Annotation<ParsedDiff | null>({
    reducer: lastWins,
    default: () => null,
  }),
  chunks: Annotation<ReviewChunk[]>({
    reducer: lastWins,
    default: () => [],
  }),
  fileIndex: Annotation<FileIndexEntry[]>({
    reducer: lastWins,
    default: () => [],
  }),
  removedOnlyFileCount: Annotation<number>({
    reducer: lastWins,
    default: () => 0,
  }),
  binaryOrEmptyFileCount: Annotation<number>({
    reducer: lastWins,
    default: () => 0,
  }),

  fileContexts: Annotation<PrFileContext[]>({
    reducer: lastWins,
    default: () => [],
  }),
  crossFileHints: Annotation<CrossFileHint[]>({
    reducer: lastWins,
    default: () => [],
  }),
  rawFindings: Annotation<Finding[]>({
    reducer: lastWins,
    default: () => [],
  }),
  analysisSummary: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),
  validatedFindings: Annotation<Finding[]>({
    reducer: lastWins,
    default: () => [],
  }),
  validationStats: Annotation<ValidationStats | null>({
    reducer: lastWins,
    default: () => null,
  }),
  summaryMarkdown: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),
  githubReviewId: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),

  status: Annotation<PrReviewRunStatus>({
    reducer: lastWins,
    default: () => 'pending',
  }),
  error: Annotation<string | null>({
    reducer: firstWriteWins,
    default: () => null,
  }),
  events: Annotation<GraphEvent[]>({
    reducer: appendEvents,
    default: () => [],
  }),
});

export const prReviewMemoryCheckpointer = new MemorySaver();
export type PrReviewGraphStateType = typeof PrReviewGraphState.State;