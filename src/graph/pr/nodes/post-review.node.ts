import { GithubApiService } from '../../../github/github-api.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';

type PostUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    'githubReviewId' | 'status' | 'events' | 'error'
  >
>;

export function createPostReviewNode(
  github: GithubApiService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<PostUpdate> {
  return async (state) => {
    if (!state.summaryMarkdown?.trim()) {
      return {
        status: 'failed',
        error: 'Missing summaryMarkdown',
        events: [
          {
            node: 'postReview',
            status: 'failed',
            message: 'Missing summaryMarkdown',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const installationId = BigInt(state.installationId);
    const { reviewRunId, repoFullName, prNumber, summaryMarkdown } = state;

    const { result: githubReviewId, events } = await runPrSteps(
      reviewRunId,
      progress,
      [
        {
          step: 'posting_review',
          graphNode: 'postReview',
          fn: () =>
            github.createPullRequestReview(
              installationId,
              repoFullName,
              prNumber,
              summaryMarkdown,
            ),
        },
      ],
    );

    return {
      githubReviewId: String(githubReviewId),
      status: 'complete',
      events,
    };
  };
}