import {
  GithubApiService,
  isDiffTruncated,
  MAX_DIFF_CHARS,
} from '../../../github/github-api.service';
import type { FileIndexEntry } from '../../../diff/types/review-chunk.types';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import type { GraphEvent } from '../../state.annotation';

type IngestUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    | 'prTitle'
    | 'prBody'
    | 'diffText'
    | 'diffTruncated'
    | 'apiFileIndex'
    | 'status'
    | 'error'
    | 'events'
  >
>;

type DiffFetchResult = {
  diffText: string;
  diffTruncated: boolean;
  apiFileIndex?: FileIndexEntry[];
};

export function createDiffIngestionNode(
  github: GithubApiService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<IngestUpdate> {
  return async (state) => {
    const installationId = BigInt(state.installationId);
    const { reviewRunId, repoFullName, prNumber, headSha } = state;
    const allEvents: GraphEvent[] = [];

    const prStep = await runPrSteps(reviewRunId, progress, [
      {
        step: 'fetching_pr',
        graphNode: 'ingestDiff',
        fn: () =>
          github.getPullRequest(installationId, repoFullName, prNumber),
      },
    ]);
    allEvents.push(...prStep.events);
    const pr = prStep.result;

    const fetchFullDiff = async (): Promise<DiffFetchResult> => {
      const text = await github.getPullRequestDiff(
        installationId,
        repoFullName,
        prNumber,
      );
      const truncated = isDiffTruncated(text);
      let apiFileIndex: FileIndexEntry[] | undefined;
      if (truncated) {
        const apiFiles = await github.listPullRequestChangedFiles(
          installationId,
          repoFullName,
          prNumber,
        );
        apiFileIndex = apiFiles.map((f) => ({
          path: f.path,
          previousPath: f.previousPath,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        }));
      }
      return { diffText: text, diffTruncated: truncated, apiFileIndex };
    };

    const diffStep = await runPrSteps(reviewRunId, progress, [
      {
        step: 'fetching_diff',
        graphNode: 'ingestDiff',
        fn: async (): Promise<DiffFetchResult> => {
          if (state.isIncrementalReview && state.previousReview?.headSha) {
            const priorHeadSha = state.previousReview.headSha;
            try {
              const text = await github.compareCommits(
                installationId,
                repoFullName,
                priorHeadSha,
                headSha,
              );
              const truncated = isDiffTruncated(text);
              const looksLikeDiff =
                text.includes('diff --git ') ||
                text.includes('\n+++ ') ||
                text.includes('\n--- ');

              if (!truncated && looksLikeDiff && text.trim()) {
                return { diffText: text, diffTruncated: false };
              }

              if (!text.trim()) {
                const changedFiles = await github.getCompareChangedFileCount(
                  installationId,
                  repoFullName,
                  priorHeadSha,
                  headSha,
                );
                if (changedFiles === 0) {
                  return { diffText: '', diffTruncated: false };
                }
              }
            } catch {
              // Fall through to fetchFullDiff on compare failure
            }
          }

          return fetchFullDiff();
        },
      },
    ]);
    allEvents.push(...diffStep.events);
    const { diffText, diffTruncated, apiFileIndex } = diffStep.result;

    return {
      prTitle: pr.title ?? `PR #${prNumber}`,
      prBody: pr.body ?? null,
      diffText,
      diffTruncated,
      apiFileIndex,
      status: 'running',
      events: allEvents,
    };
  };
}