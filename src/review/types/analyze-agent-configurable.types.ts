import type { CrossFileHint } from './cross-file-hint.types';
import type { PrSearchExecutorContext } from '../context/pr-search-tool-executor.service';

export const ANALYZE_AGENT_CONFIG_KEY = 'analyzeAgent';

export type AnalyzeAgentConfigurable = {
  installationId: string;
  repoFullName: string;
  searchCtx: PrSearchExecutorContext;
  hintsAccumulator: CrossFileHint[];
  searchToolCallCount: { current: number };
  maxToolRounds: number;
  onSearchToolCall?: (meta: {
    toolName: string;
    symbol?: string;
    modulePath?: string;
  }) => void;
};

export function getAnalyzeAgentConfigurable(
  config: { configurable?: Record<string, unknown> } | undefined,
): AnalyzeAgentConfigurable | undefined {
  const cfg = config?.configurable?.[ANALYZE_AGENT_CONFIG_KEY] as
    | AnalyzeAgentConfigurable
    | undefined;
  return cfg;
}
