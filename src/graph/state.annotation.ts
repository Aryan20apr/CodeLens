import { Annotation, MemorySaver } from "@langchain/langgraph";
import type { CodeMetadata, ParseStatus, SnippetSource } from './state.types';


function lastWins<T>(left: T, right: T | undefined): T{
    return right === undefined ? left : right;
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
      reducer: (left, right) => (right === undefined ? left : right),
      default: () => null,
    }),
  });

export const snippetMemoryCheckpointer = new MemorySaver();
export type SnippetGraphStateType = typeof SnippetGraphState.State;
  
