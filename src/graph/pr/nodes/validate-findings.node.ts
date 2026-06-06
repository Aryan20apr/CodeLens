import { formatReviewBody } from '../../../review/findings/format-review-body.util';
import { ValidatePrFindingsService } from '../../../review/findings/validator.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';

type ValidateUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    | 'validatedFindings'
    | 'validationStats'
    | 'summaryMarkdown'
    | 'events'
    | 'error'
    | 'status'
  >
>;

export function createValidateFindingsNode(
  validator: ValidatePrFindingsService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<ValidateUpdate> {
  return async (state) => {
    if (!state.analysisSummary?.trim()) {
      return {
        status: 'failed',
        error: 'Missing analysisSummary',
        events: [
          {
            node: 'validateFindings',
            status: 'failed',
            message: 'Missing analysisSummary',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const { reviewRunId } = state;

    const { result, events } = await runPrSteps(reviewRunId, progress, [
      {
        step: 'validating_findings',
        graphNode: 'validateFindings',
        meta: { rawCount: state.rawFindings.length },
        fn: async () => {
          const { validatedFindings, validationStats } = validator.validate({
            rawFindings: state.rawFindings,
            analysisSummary: state.analysisSummary!,
            chunks: state.chunks,
            fileIndex: state.fileIndex,
            crossFileHints: state.crossFileHints,
            config: validator.getDefaultConfig(),
          });

          const summaryMarkdown = formatReviewBody(
            state.analysisSummary!,
            validatedFindings.length,
          );

          return { validatedFindings, validationStats, summaryMarkdown };
        },
      },
    ]);

    await progress.stepCompleted(reviewRunId, 'validating_findings', {
      rawCount: result.validationStats.rawCount,
      validCount: result.validationStats.validCount,
      droppedCount: result.validationStats.droppedCount,
      dropReasons: result.validationStats.dropReasons,
    });

    return {
      validatedFindings: result.validatedFindings,
      validationStats: result.validationStats,
      summaryMarkdown: result.summaryMarkdown,
      events,
    };
  };
}
