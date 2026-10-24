import { z } from 'zod';
import { tool, type ToolRuntime } from '@langchain/core/tools';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import { getAnalyzeAgentConfigurable } from '../types/analyze-agent-configurable.types';
import type { PrSearchToolExecutorService } from './pr-search-tool-executor.service';
import { PrReviewContextSchema } from './pr-review-context.schema';

export const PR_SEARCH_TOOL_NAMES = {
  symbolUsage: 'search_symbol_usage',
  importTarget: 'search_import_target',
  fileContent: 'get_file_content_at_sha',
  legacyFileContent: 'get_file_content',
} as const;

function extractContext(
  runtime?: ToolRuntime<any, typeof PrReviewContextSchema> | any,
): {
  installationId: bigint;
  repoFullName: string;
  headSha: string;
  reviewRunId: string;
} {
  const ctx = runtime?.context ?? runtime?.config?.configurable;
  return {
    installationId: BigInt(ctx?.installationId ?? '0'),
    repoFullName: ctx?.repoFullName ?? '',
    headSha: ctx?.headSha ?? '',
    reviewRunId: ctx?.reviewRunId ?? 'default-run',
  };
}

/**
 * Standard LangChain tools with contextSchema for DeepAgents autonomous reviews.
 * Tools extract repo coordinates automatically from runtime.context without LLM intervention.
 */
export function createAutonomousRepoTools(
  executor: PrSearchToolExecutorService,
) {
  return [
    tool(
      async (
        { symbol },
        runtime?: ToolRuntime<any, typeof PrReviewContextSchema>,
      ) => {
        const ctx = extractContext(runtime);
        if (!ctx.repoFullName || !ctx.headSha) {
          return 'Repository context (repoFullName, headSha) not available in runtime.';
        }

        const execCtx = executor.getOrCreateContext(
          ctx.reviewRunId,
          ctx.installationId,
          ctx.repoFullName,
          ctx.headSha,
        );

        const { toolMessage } = await executor.executeToolCall(
          execCtx,
          PR_SEARCH_TOOL_NAMES.symbolUsage,
          { symbol },
        );
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
      async (
        { modulePath },
        runtime?: ToolRuntime<any, typeof PrReviewContextSchema>,
      ) => {
        const ctx = extractContext(runtime);
        if (!ctx.repoFullName || !ctx.headSha) {
          return 'Repository context (repoFullName, headSha) not available in runtime.';
        }

        const execCtx = executor.getOrCreateContext(
          ctx.reviewRunId,
          ctx.installationId,
          ctx.repoFullName,
          ctx.headSha,
        );

        const { toolMessage } = await executor.executeToolCall(
          execCtx,
          PR_SEARCH_TOOL_NAMES.importTarget,
          { modulePath },
        );
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
    tool(
      async (
        { filePath },
        runtime?: ToolRuntime<any, typeof PrReviewContextSchema>,
      ) => {
        const ctx = extractContext(runtime);
        if (!ctx.repoFullName || !ctx.headSha) {
          return 'Repository context (repoFullName, headSha) not available in runtime.';
        }

        const execCtx = executor.getOrCreateContext(
          ctx.reviewRunId,
          ctx.installationId,
          ctx.repoFullName,
          ctx.headSha,
        );

        const { toolMessage } = await executor.executeToolCall(
          execCtx,
          PR_SEARCH_TOOL_NAMES.fileContent,
          { filePath },
        );
        return toolMessage;
      },
      {
        name: PR_SEARCH_TOOL_NAMES.fileContent,
        description:
          'Fetch the full source of a file in the repository at the PR head commit. Use when diff chunks alone are insufficient — for example, to see the full function body or file imports for security or performance concerns.',
        schema: z.object({
          filePath: z
            .string()
            .min(1)
            .describe('Repo-relative file path, e.g. src/auth/auth.service.ts'),
        }),
      },
    ),
  ];
}

/**
 * Backward compatibility wrapper for legacy ReAct analyze subagent.
 */
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
    tool(
      async ({ filePath }, config: LangGraphRunnableConfig) => {
        const cfg = getAnalyzeAgentConfigurable(config);
        if (!cfg) {
          return 'File access is not configured for this review run.';
        }

        const { toolMessage } = await executor.executeToolCall(
          cfg.searchCtx,
          PR_SEARCH_TOOL_NAMES.legacyFileContent,
          { filePath },
        );
        return toolMessage;
      },
      {
        name: PR_SEARCH_TOOL_NAMES.legacyFileContent,
        description:
          'Fetch the full source of a changed file at the PR head commit. Use when diff chunks alone are insufficient — for example, to see the full function body for a performance or security concern. Pass the path exactly as listed in the changed files section.',
        schema: z.object({
          filePath: z
            .string()
            .min(1)
            .describe('Repo-relative file path, e.g. src/auth/auth.service.ts'),
        }),
      },
    ),
  ];
}
