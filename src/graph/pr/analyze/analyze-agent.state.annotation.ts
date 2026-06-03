import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

import type { CrossFileHint } from '../../../review/context/cross-file-hint.types';
import { lastWins } from '../../state.annotation';

function appendMessages(
  left: BaseMessage[],
  right: BaseMessage[] | BaseMessage | undefined,
): BaseMessage[] {
  if (right === undefined) {
    return left;
  }
  if (Array.isArray(right)) {
    return left.concat(right);
  }
  return left.concat([right]);
}

function appendHints(
  left: CrossFileHint[],
  right: CrossFileHint[] | undefined,
): CrossFileHint[] {
  if (!right || right.length === 0) {
    return left;
  }
  return left.concat(right);
}

export const AnalyzeAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: appendMessages,
    default: () => [],
  }),
  crossFileHints: Annotation<CrossFileHint[]>({
    reducer: appendHints,
    default: () => [],
  }),
  searchToolCallCount: Annotation<number>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => 0,
  }),
  summaryMarkdown: Annotation<string | null>({
    reducer: lastWins,
    default: () => null,
  }),
  toolRoundCount: Annotation<number>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => 0,
  }),
});

export type AnalyzeAgentStateType = typeof AnalyzeAgentState.State;
