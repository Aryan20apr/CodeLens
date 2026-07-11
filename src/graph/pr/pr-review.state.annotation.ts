import { Annotation } from '@langchain/langgraph';

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
import type { AgentRole } from '../../review/types/agent-prompt.types';


function concatFindings(
  left: Finding[],
  right: Finding[] | undefined,
): Finding[] {
  if (!right || right.length === 0) return left;
  return [...left, ...right];
}

function concatSummaries(
  left: Array<{ role: string; summary: string }>,
  right: Array<{ role: string; summary: string }> | undefined,
): Array<{ role: string; summary: string }> {
  if (!right || right.length === 0) return left;
  return [...left, ...right];
}

function concatHints(
  left: CrossFileHint[],
  right: CrossFileHint[] | undefined,
): CrossFileHint[] {
  if (!right || right.length === 0) return left;
  return [...left, ...right];
}



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
  reviewMode: Annotation<'FULL' | 'INCREMENTAL'>({
    reducer: firstWriteWins,
    default: () => 'FULL',
  }),
  priorHeadSha: Annotation<string | null>({
    reducer: firstWriteWins,
    default: () => null,
  }),
  parentRunId: Annotation<string | null>({
    reducer: firstWriteWins,
    default: () => null,
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
    reducer: concatHints,
    default: () => [],
  }),
  analysisRoute: Annotation<'simple' | 'specialized' | null>({
    reducer: lastWins,
    default: () => null,
  }),
  selectedAgents: Annotation<AgentRole[]>({
    reducer: lastWins,
    default: () => [],
  }),
  agentFindings: Annotation<Finding[]>({
    reducer: concatFindings,
    default: () => [],
  }),
  agentSummaries: Annotation<Array<{ role: string; summary: string }>>({
    reducer: concatSummaries,
    default: () => [],
  }),

  // Written by aggregateFindings; consumed by validateFindings
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

export type PrReviewGraphStateType = typeof PrReviewGraphState.State;