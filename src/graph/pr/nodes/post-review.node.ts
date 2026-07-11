import { GithubApiService } from '../../../github/github-api.service';
import { PostedFindingRepository } from '../../../db/github/posted-finding.repository';
import { buildFindingFingerprint } from '../../../review/findings/finding-fingerprint.util';
import { formatReviewBody } from '../../../review/findings/format-review-body.util';
import { mapFindingsToGithubComments } from '../../../review/findings/comment-mapper.util';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import type { Finding } from '../../../graph/state.types';

type PostUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    'githubReviewId' | 'status' | 'events' | 'error' | 'summaryMarkdown'
  >
>;

const NO_NEW_ISSUES_BODY = 'No new issues in this push.';

function filterNewFindings(
  findings: Finding[],
  knownFingerprints: Set<string>,
): Finding[] {
  return findings.filter((finding) => {
    const fingerprint = buildFindingFingerprint(finding);
    if (!fingerprint) return true;
    return !knownFingerprints.has(fingerprint);
  });
}

export function createPostReviewNode(
  github: GithubApiService,
  progress: PrReviewProgressPublisher,
  postedFindings: PostedFindingRepository,
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
      analysisSummary,
    } = state;

    const knownFingerprints = await postedFindings.findFingerprints(
      repoFullName,
      prNumber,
    );
    const newFindings = filterNewFindings(validatedFindings, knownFingerprints);

    const comments =
      newFindings.length > 0
        ? mapFindingsToGithubComments(newFindings, maxCommentBodyChars)
        : [];

    const reviewBody =
      newFindings.length > 0
        ? formatReviewBody(
            analysisSummary?.trim() || summaryMarkdown,
            newFindings.length,
          )
        : NO_NEW_ISSUES_BODY;

    const { result: githubReviewId, events } = await runPrSteps(
      reviewRunId,
      progress,
      [
        {
          step: 'posting_review',
          graphNode: 'postReview',
          meta: {
            inlineCommentCount: comments.length,
            dedupedCount: validatedFindings.length - newFindings.length,
          },
          fn: () =>
            github.createPullRequestReview(
              installationId,
              repoFullName,
              prNumber,
              {
                headSha,
                body: reviewBody,
                comments,
              },
            ),
        },
      ],
    );

    if (newFindings.length > 0) {
      await postedFindings.insertMany(
        newFindings.flatMap((finding) => {
          const fingerprint = buildFindingFingerprint(finding);
          if (!fingerprint) return [];
          return [
            {
              repoFullName,
              prNumber,
              fingerprint,
              reviewRunId,
              filePath: finding.filePath ?? null,
              category: finding.category,
              headSha,
              githubReviewId,
            },
          ];
        }),
      );
    }

    await progress.stepCompleted(reviewRunId, 'posting_review', {
      inlineCommentCount: comments.length,
      dedupedCount: validatedFindings.length - newFindings.length,
      githubReviewId: String(githubReviewId),
    });

    return {
      githubReviewId: String(githubReviewId),
      summaryMarkdown: reviewBody,
      status: 'complete',
      events,
    };
  };
}
