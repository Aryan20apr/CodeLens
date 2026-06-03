import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import { getAnalyzeAgentConfigurable } from './analyze-agent-configurable.types';
import type { PrSearchToolExecutorService } from './pr-search-tool-executor.service';

export const PR_SEARCH_TOOL_NAMES = {
  symbolUsage: 'search_symbol_usage',
  importTarget: 'search_import_target',
} as const;


export function createAnalyzeSearchTools(
  executor: PrSearchToolExecutorService,
) {
  return [
    tool(
      async ({ symbol }, config: LangGraphRunnableConfig) => {
        const cfg = getAnalyzeAgentConfigurable(config);
        if (!cfg) {
          return 'Search is not configured for this review run.';
        }

        cfg.searchToolCallCount.current += 1;
        cfg.onSearchToolCall?.({
          toolName: PR_SEARCH_TOOL_NAMES.symbolUsage,
          symbol,
        });

        const { hint, toolMessage } = await executor.executeToolCall(
          cfg.searchCtx,
          PR_SEARCH_TOOL_NAMES.symbolUsage,
          { symbol },
        );
        if (hint && hint.paths.length > 0) {
          cfg.hintsAccumulator.push(hint);
        }
        return toolMessage;
      },
      {
        name: PR_SEARCH_TOOL_NAMES.symbolUsage,
        description:
          'Search the repository for usages of a symbol (function, class, type). Use when the PR changes a public API, export, or rename and you need callers elsewhere.',
        schema: z.object({
          symbol: z
            .string()
            .min(1)
            .describe('Exact symbol name from AST or diff'),
        }),
      },
    ),
    tool(
      async ({ modulePath }, config: LangGraphRunnableConfig) => {
        const cfg = getAnalyzeAgentConfigurable(config);
        if (!cfg) {
          return 'Search is not configured for this review run.';
        }

        cfg.searchToolCallCount.current += 1;
        cfg.onSearchToolCall?.({
          toolName: PR_SEARCH_TOOL_NAMES.importTarget,
          modulePath,
        });

        const { hint, toolMessage } = await executor.executeToolCall(
          cfg.searchCtx,
          PR_SEARCH_TOOL_NAMES.importTarget,
          { modulePath },
        );
        if (hint && hint.paths.length > 0) {
          cfg.hintsAccumulator.push(hint);
        }
        return toolMessage;
      },
      {
        name: PR_SEARCH_TOOL_NAMES.importTarget,
        description:
          'Best-effort search for files importing a module path. Use when module boundaries or barrel exports may break consumers.',
        schema: z.object({
          modulePath: z
            .string()
            .min(1)
            .describe('Repo-relative path or import path segment'),
        }),
      },
    ),
  ];
}
