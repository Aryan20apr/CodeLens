import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { StructuredToolInterface } from '@langchain/core/tools';

import type { LlmService } from '../../../../llm/llm.service';
import type { AnalyzeAgentStateType } from '../analyze-agent.state.annotation';

export function createAnalyzeLlmNode(
  llm: LlmService,
  tools: StructuredToolInterface[],
) {
  return async (
    state: AnalyzeAgentStateType,
    _config?: LangGraphRunnableConfig,
  ): Promise<Partial<AnalyzeAgentStateType>> => {
    const model = llm.getChatModel();
    if (typeof model.bindTools !== 'function') {
      throw new Error('Chat model does not support bindTools');
    }
    const modelWithTools = model.bindTools(tools);
    const ai = await modelWithTools.invoke(state.messages);

    return {
      messages: [ai],
      toolRoundCount: state.toolRoundCount + 1,
    };
  };
}
