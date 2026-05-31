import { PrSummaryService } from '../../../review/pr-summary.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';

type AnalyzeUpdate = Partial<
  Pick<PrReviewGraphStateType, 'summaryMarkdown' | 'events' | 'error' | 'status' | 'parsed' | 'chunks'>
>;

export function createAnalyzeNode(
  summary: PrSummaryService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<AnalyzeUpdate> {
  return async (state) => {
    if (!state.parsed || state.chunks.length === 0) {
      return {
        status: 'failed',
        error: 'Missing parsed diff or chunks',
        events: [
          {
            node: 'analyze',
            status: 'failed',
            message: 'Missing parsed diff or chunks',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const { reviewRunId, repoFullName, prNumber } = state;

    const { result: summaryMarkdown, events } = await runPrSteps(
      reviewRunId,
      progress,
      [
        {
          step: 'summarizing',
          graphNode: 'analyze',
          meta: { chunkCount: state.chunks.length },
          fn: () =>
            summary.summarize({
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
              apiFileIndex: state.apiFileIndex,
              fileContexts: state.fileContexts ?? [],
            }),
        },
      ],
    );

    return { summaryMarkdown, events };
  };
}