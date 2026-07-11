import {
  GithubApiService,
  isDiffTruncated,
} from '../../../github/github-api.service';
import type { FileIndexEntry } from '../../../diff/types/review-chunk.types';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import { GraphEvent } from 'src/graph/state.annotation';

type IngestUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    | 'prTitle'
    | 'prBody'
    | 'diffText'
    | 'diffTruncated'
    | 'completeFileIndex'
    | 'status'
    | 'error'
    | 'events'
  >
>;

type DiffFetchResult = {
  diffText: string;
  diffTruncated: boolean;
  completeFileIndex?: FileIndexEntry[];
};

async function buildCompleteFileIndex(
  github: GithubApiService,
  installationId: bigint,
  repoFullName: string,
  prNumber: number,
): Promise<FileIndexEntry[] | undefined> {
  const apiFiles = await github.listPullRequestChangedFiles(
    installationId,
    repoFullName,
    prNumber,
  );
  return apiFiles.map((f) => ({
    path: f.path,
    previousPath: f.previousPath,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
  }));
}

export function createDiffIngestionNode(
  github: GithubApiService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<IngestUpdate> {
  return async (state) => {
    const installationId = BigInt(state.installationId);
    const { reviewRunId, repoFullName, prNumber } = state;
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

    const fetchFullDiff = async (
      meta?: Record<string, unknown>,
    ): Promise<DiffFetchResult> => {
      const diffStep = await runPrSteps(reviewRunId, progress, [
        {
          step: 'fetching_diff',
          graphNode: 'ingestDiff',
          meta,
          fn: async () => {
            const text = await github.getPullRequestDiff(
              installationId,
              repoFullName,
              prNumber,
            );
            const truncated = isDiffTruncated(text);
            let completeFileIndex: FileIndexEntry[] | undefined;
            if (truncated) {
              completeFileIndex = await buildCompleteFileIndex(
                github,
                installationId,
                repoFullName,
                prNumber,
              );
            }
            return { diffText: text, diffTruncated: truncated, completeFileIndex };
          },
        },
      ]);
      allEvents.push(...diffStep.events);
      return diffStep.result;
    };

    let diffResult: DiffFetchResult;

    if (state.reviewMode === 'INCREMENTAL' && state.priorHeadSha?.trim()) {
      const priorHeadSha = state.priorHeadSha.trim();
      let fallbackToFull = false;

      try {
        const incrementalStep = await runPrSteps(reviewRunId, progress, [
          {
            step: 'computing_incremental_diff',
            graphNode: 'ingestDiff',
            meta: { priorHeadSha, reviewMode: state.reviewMode },
            fn: async () => {
              const text = await github.compareCommits(
                installationId,
                repoFullName,
                priorHeadSha,
                state.headSha,
              );
              return { diffText: text, diffTruncated: isDiffTruncated(text) };
            },
          },
        ]);
        allEvents.push(...incrementalStep.events);
        const incremental = incrementalStep.result;

        if (incremental.diffTruncated) {
          fallbackToFull = true;
        } else if (!incremental.diffText.trim()) {
          const changedFiles = await github.getCompareChangedFileCount(
            installationId,
            repoFullName,
            priorHeadSha,
            state.headSha,
          );
          if (changedFiles > 0) {
            fallbackToFull = true;
          } else {
            diffResult = {
              diffText: incremental.diffText,
              diffTruncated: false,
            };
          }
        } else {
          diffResult = incremental;
        }
      } catch {
        fallbackToFull = true;
      }

      if (fallbackToFull) {
        diffResult = await fetchFullDiff({ fallbackToFull: true, priorHeadSha });
      }
    } else {
      diffResult = await fetchFullDiff();
    }

    const { diffText, diffTruncated, completeFileIndex } = diffResult!;

    return {
      prTitle: pr.title ?? `PR #${prNumber}`,
      prBody: pr.body ?? null,
      diffText,
      diffTruncated,
      completeFileIndex,
      status: 'running',
      events: allEvents,
    };
  };
}
