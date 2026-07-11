import type { AgentPromptService } from '../../../review/agent-prompt.service';
import type { AgentRole } from '../../../review/types/agent-prompt.types';
import type { PrAnalyzeAgentFactory } from '../analyze/analyze-agent.factory';
import type { PrReviewPromptService } from '../../../review/pr-review-prompt.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import type { PrReviewStep } from '../../../streaming/types/pr-review-progress.types';
import { runPrSteps } from '../pr-node-progress.util';

const AGENT_STEP: Record<AgentRole, PrReviewStep> = {
  security: 'analyzing_security',
  performance: 'analyzing_performance',
  best_practices: 'analyzing_best_practices',
};

type SpecializedAgentUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    | 'agentFindings'
    | 'agentSummaries'
    | 'crossFileHints'
    | 'events'
    | 'error'
    | 'status'
  >
>;

export function createSpecializedAgentNode(
  role: AgentRole,
  agentPromptService: AgentPromptService,
  promptService: PrReviewPromptService,
  analyzeAgent: PrAnalyzeAgentFactory,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<SpecializedAgentUpdate> {
  return async (state) => {
    if (!state.parsed || state.chunks.length === 0) {
      return {
        status: 'failed',
        error: `[${role}] Missing parsed diff or chunks`,
        events: [
          {
            node: `${role}Agent`,
            status: 'failed',
            message: 'Missing parsed diff or chunks',
            at: new Date().toISOString(),
          },
        ],
      };

    }

    const { reviewRunId, repoFullName, prNumber, installationId, headSha } = state;
    const enrichedFileCount = (state.fileContexts ?? []).filter(
        (c) => c.fetchStatus === 'ok',
      ).length;
      const promptInput = {
        repoFullName,
        prNumber,
        title: state.prTitle ?? `PR #${prNumber}`,
        body: state.prBody ?? null,
        parsed: state.parsed,
        chunks: state.chunks,
        fileIndex: state.fileIndex,
        removedOnlyFileCount: state.removedOnlyFileCount,
        binaryOrEmptyFileCount: state.binaryOrEmptyFileCount,
        diffTruncated: state.diffTruncated,
        completeFileIndex: state.completeFileIndex,
        fileContexts: state.fileContexts ?? [],
        enrichedFileCount,
      };
      const step = AGENT_STEP[role];

      const { result, events } = await runPrSteps(reviewRunId, progress, [
        {
          step,
          graphNode: `${role}Agent`,
          meta: { chunkCount: state.chunks.length, role },
          fn: async () => {
            const prompt = promptService.build(promptInput);
            const systemPrompt = agentPromptService.buildSystemPrompt(
              role,
              prompt.skipSearchTools,
            );
  
            if (prompt.skipSearchTools) {
              const llmAnalysis = await analyzeAgent.invokeDirect(
                systemPrompt,
                prompt.userContent,
              );
              return {
                llmAnalysis,
                crossFileHints: [],
                searchToolCallCount: 0,
              };
            }
  
            return analyzeAgent.invokeWithSearchTools({
              reviewRunId,
              agentRole: role,
              systemPrompt,
              userContent: prompt.userContent,
              installationId: BigInt(installationId),
              repoFullName,
              headSha,
              onSearchToolCall: ({ toolName, symbol, modulePath }) => {
                void progress.stepStarted(
                  reviewRunId,
                  'searching_code',
                  `[${role}] Searching: ${toolName}`,
                  { toolName, symbol, modulePath, agentRole: role },
                );
              },
            });
          },
        },
      ]);
  
      if (result.searchToolCallCount > 0) {
        await progress.stepCompleted(reviewRunId, 'searching_code', {
          agentRole: role,
          searchQueries: result.searchToolCallCount,
          hintCount: result.crossFileHints.length,
          paths: result.crossFileHints.flatMap((h) => h.paths),
        });
      }
  
      return {
        agentFindings: result.llmAnalysis.findings,
        agentSummaries: [{ role, summary: result.llmAnalysis.summary }],
        crossFileHints: result.crossFileHints,
        events,
      };
    };
  }