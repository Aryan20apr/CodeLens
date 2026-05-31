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
import type { PrReviewRunStatus } from '../state.types';

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