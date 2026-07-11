import type { PrAnalyzeAgentFactory } from '../analyze/analyze-agent.factory';
import type { PrReviewPromptService } from '../../../review/pr-review-prompt.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';

type SimpleAnalyzeUpdate = Partial<
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

export function createSimpleAnalyzeNode(
  promptService: PrReviewPromptService,
  analyzeAgent: PrAnalyzeAgentFactory,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<SimpleAnalyzeUpdate> {
  return async (state) => {
    if (!state.parsed || state.chunks.length === 0) {
      return {
        status: 'failed',
        error: 'Missing parsed diff or chunks',
        events: [
          {
            node: 'simpleAnalyze',
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

    const { result, events } = await runPrSteps(reviewRunId, progress, [
      {
        step: 'summarizing',
        graphNode: 'simpleAnalyze',
        meta: { chunkCount: state.chunks.length },
        fn: async () => {
          const prompt = promptService.build(promptInput);

          if (prompt.skipSearchTools) {
            const llmAnalysis = await analyzeAgent.invokeDirect(
              prompt.systemPrompt,
              prompt.userContent,
            );
            return { llmAnalysis, crossFileHints: [], searchToolCallCount: 0 };
          }

          return analyzeAgent.invokeWithSearchTools({
            reviewRunId,
            agentRole: 'best_practices',   // general prompt; role used only for logging
            systemPrompt: prompt.systemPrompt,
            userContent: prompt.userContent,
            installationId: BigInt(installationId),
            repoFullName,
            headSha,
            onSearchToolCall: ({ toolName, symbol, modulePath }) => {
              void progress.stepStarted(
                reviewRunId,
                'searching_code',
                `Searching: ${toolName}`,
                { toolName, symbol, modulePath },
              );
            },
          });
        },
      },
    ]);

    if (result.searchToolCallCount > 0) {
      await progress.stepCompleted(reviewRunId, 'searching_code', {
        searchQueries: result.searchToolCallCount,
        hintCount: result.crossFileHints.length,
        paths: result.crossFileHints.flatMap((h) => h.paths),
      });
    }

    return {
      agentFindings: result.llmAnalysis.findings,
      agentSummaries: [{ role: 'general', summary: result.llmAnalysis.summary }],
      crossFileHints: result.crossFileHints,
      events,
    };
  };
}