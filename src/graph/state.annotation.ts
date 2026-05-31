import { Annotation, MemorySaver } from '@langchain/langgraph';
import type {
  CodeMetadata,
  LlmAnalysis,
  ParseStatus,
  Score,
  SnippetSource,
  StructuredReport,
} from './state.types';

export type GraphEvent = {
  node: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  at: string; // ISO timestamp
};

export function lastWins<T>(left: T, right: T | undefined): T {
  return right === undefined ? left : right;
}

function hasFirstWriteValue<T>(value: T): boolean {
  if (value === null || value === undefined) return false;
  if (value === '') return false;
  if (value === 0) return false;
  return true;
}

export function firstWriteWins<T>(left: T, right: T | undefined): T {
  if (hasFirstWriteValue(left)) return left;
  if (right !== undefined && hasFirstWriteValue(right)) return right;
  return left;
}

export function appendEvents(
  left: GraphEvent[],
  right: GraphEvent[] | undefined,
): GraphEvent[] {
  if (!right || right.length === 0) return left;
  return left.concat(right);
}

/**
 * Central graph state. Each field is a “channel” with a reducer.
 */
export const SnippetGraphState = Annotation.Root({
  source: Annotation<SnippetSource | null>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => null,
  }),
  /**
   * Normalized language id: `typescript`, `javascript`, `python`, `go`, or `unknown`.
   */
  language: Annotation<string | null>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => null,
  }),
  metadata: Annotation<CodeMetadata | null>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => null,
  }),
  status: Annotation<ParseStatus>({
    reducer: (left, right) => lastWins(left, right),
    default: () => 'pending',
  }),
  error: Annotation<string | null>({
    reducer: (left, right) => firstWriteWins(left, right),
    default: () => null,
  }),

  llmAnalysis: Annotation<LlmAnalysis | null>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => null,
  }),
  score: Annotation<Score | null>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => null,
  }),
  report: Annotation<StructuredReport | null>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => null,
  }),
  iteration: Annotation<number>({
    reducer: (_, right) => right ?? 0,
    default: () => 0,
  }),
  
  maxIterations: Annotation<number>({
    reducer: (_, right) => right ?? 1,
    default: () => 1,
  }),
  
  qualityGatePassed: Annotation<boolean | null>({
    reducer: (_, right) => right ?? null,
    default: () => null,
  }),
  // Append only event stream ( progress + non fatal diagnostics)
  events: Annotation<GraphEvent[]>({
    reducer: (left, right) => appendEvents(left, right),
    default: () => [],
  }),
});

export const snippetMemoryCheckpointer = new MemorySaver();
export type SnippetGraphStateType = typeof SnippetGraphState.State;
