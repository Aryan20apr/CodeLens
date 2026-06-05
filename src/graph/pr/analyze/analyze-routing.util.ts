import { AIMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import { getAnalyzeAgentConfigurable } from '../../../review/types/analyze-agent-configurable.types';
import type { AnalyzeAgentStateType } from './analyze-agent.state.annotation';

export type AnalyzeRouteTarget = 'searchTools' | 'analyzeFinalize';

export function routeAfterAnalyzeLlm(
  state: AnalyzeAgentStateType,
  config?: LangGraphRunnableConfig,
): AnalyzeRouteTarget {
  const cfg = getAnalyzeAgentConfigurable(config);
  const maxRounds = cfg?.maxToolRounds ?? 3;

  if (state.toolRoundCount >= maxRounds) {
    return 'analyzeFinalize';
  }

  const messages = state.messages;
  const last = messages.at(-1);
  if (!(last instanceof AIMessage)) {
    return 'analyzeFinalize';
  }

  const toolCalls = last.tool_calls ?? [];
  if (toolCalls.length > 0) {
    return 'searchTools';
  }

  return 'analyzeFinalize';
}
