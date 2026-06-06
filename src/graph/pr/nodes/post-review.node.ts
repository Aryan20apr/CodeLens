import { GithubApiService } from '../../../github/github-api.service';
import { mapFindingsToGithubComments } from '../../../review/findings/comment-mapper.util';
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
  maxCommentBodyChars: number,
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

    if (!state.headSha?.trim()) {
      return {
        status: 'failed',
        error: 'Missing headSha',
        events: [
          {
            node: 'postReview',
            status: 'failed',
            message: 'Missing headSha',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const installationId = BigInt(state.installationId);
    const {
      reviewRunId,
      repoFullName,
      prNumber,
      summaryMarkdown,
      headSha,
      validatedFindings,
    } = state;

    const comments = mapFindingsToGithubComments(
      validatedFindings,
      maxCommentBodyChars,
    );

    const { result: githubReviewId, events } = await runPrSteps(
      reviewRunId,
      progress,
      [
        {
          step: 'posting_review',
          graphNode: 'postReview',
          meta: { inlineCommentCount: comments.length },
          fn: () =>
            github.createPullRequestReview(
              installationId,
              repoFullName,
              prNumber,
              {
                headSha,
                body: summaryMarkdown,
                comments,
              },
            ),
        },
      ],
    );

    await progress.stepCompleted(reviewRunId, 'posting_review', {
      inlineCommentCount: comments.length,
      githubReviewId: String(githubReviewId),
    });

    return {
      githubReviewId: String(githubReviewId),
      status: 'complete',
      events,
    };
  };
}
