import {
  GithubApiService,
  isDiffTruncated,
} from '../../../github/github-api.service';
import type { FileIndexEntry } from '../../../diff/types/review-chunk.types';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import { GraphEvent } from 'src/graph/state.annotation';
import type { Logger } from 'winston';

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

function countFilesInUnifiedDiff(diffText: string): number {
  const matches = diffText.match(/^diff --git /gm);
  return matches?.length ?? 0;
}

function logDiffIngestOutcome(
  logger: Logger,
  reviewRunId: string,
  data: Record<string, unknown>,
): void {
  logger.info(
    `[DiffIngestionNode] [ingestDiff] :: Diff ingestion outcome`,
    { reviewRunId, ...data },
  );
}

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
  logger: Logger,
): (state: PrReviewGraphStateType) => Promise<IngestUpdate> {
  return async (state) => {
    const installationId = BigInt(state.installationId);
    const { reviewRunId, repoFullName, prNumber, headSha } = state;
    const allEvents: GraphEvent[] = [];

    logger.info(`[DiffIngestionNode] [ingestDiff] :: Starting diff ingestion`, {
      reviewRunId,
      repoFullName,
      prNumber,
      reviewMode: state.reviewMode,
      priorHeadSha: state.priorHeadSha,
      headSha,
    });

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
    let diffSource: 'full_direct' | 'incremental' | 'full_fallback' = 'full_direct';
    let fallbackReason: string | undefined;

    if (state.reviewMode === 'INCREMENTAL' && state.priorHeadSha?.trim()) {
      const priorHeadSha = state.priorHeadSha.trim();
      let fallbackToFull = false;

      logger.info(
        `[DiffIngestionNode] [ingestDiff] :: Attempting incremental compare`,
        { reviewRunId, priorHeadSha, headSha },
      );

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
        const incrementalFileCount = countFilesInUnifiedDiff(incremental.diffText);

        logger.info(
          `[DiffIngestionNode] [ingestDiff] :: Incremental compare result`,
          {
            reviewRunId,
            diffChars: incremental.diffText.length,
            diffFileCount: incrementalFileCount,
            diffTruncated: incremental.diffTruncated,
            diffEmpty: !incremental.diffText.trim(),
          },
        );

        const looksLikeUnifiedDiff =
          incremental.diffText.includes('diff --git ') ||
          incremental.diffText.includes('\n+++ ') ||
          incremental.diffText.includes('\n--- ');

        if (incremental.diffTruncated) {
          fallbackToFull = true;
          fallbackReason = 'incremental_truncated';
        } else if (
          incremental.diffText.trim() &&
          !looksLikeUnifiedDiff &&
          incrementalFileCount === 0
        ) {
          fallbackToFull = true;
          fallbackReason = 'invalid_compare_diff_format';
          logger.warn(
            `[DiffIngestionNode] [ingestDiff] :: Incremental compare returned non-diff payload`,
            {
              reviewRunId,
              diffChars: incremental.diffText.length,
              diffPreview: incremental.diffText.slice(0, 80),
            },
          );
        } else if (!incremental.diffText.trim()) {
          const changedFiles = await github.getCompareChangedFileCount(
            installationId,
            repoFullName,
            priorHeadSha,
            state.headSha,
          );
          logger.info(
            `[DiffIngestionNode] [ingestDiff] :: Empty incremental patch`,
            { reviewRunId, compareChangedFileCount: changedFiles },
          );
          if (changedFiles > 0) {
            fallbackToFull = true;
            fallbackReason = 'empty_patch_with_compare_files';
          } else {
            diffResult = {
              diffText: incremental.diffText,
              diffTruncated: false,
            };
            diffSource = 'incremental';
          }
        } else {
          diffResult = incremental;
          diffSource = 'incremental';
        }
      } catch (err) {
        fallbackToFull = true;
        fallbackReason = 'compare_error';
        logger.warn(
          `[DiffIngestionNode] [ingestDiff] :: Incremental compare failed, falling back to full PR diff`,
          {
            reviewRunId,
            priorHeadSha,
            headSha,
            error: err,
          },
        );
      }

      if (fallbackToFull) {
        logger.warn(
          `[DiffIngestionNode] [ingestDiff] :: Falling back to full PR diff`,
          { reviewRunId, fallbackReason, priorHeadSha },
        );
        diffResult = await fetchFullDiff({
          fallbackToFull: true,
          priorHeadSha,
          fallbackReason,
        });
        diffSource = 'full_fallback';
      }
    } else {
      logger.info(
        `[DiffIngestionNode] [ingestDiff] :: Using full PR diff (not incremental)`,
        {
          reviewRunId,
          reviewMode: state.reviewMode,
          priorHeadSha: state.priorHeadSha,
        },
      );
      diffResult = await fetchFullDiff();
    }

    const { diffText, diffTruncated, completeFileIndex } = diffResult!;

    logDiffIngestOutcome(logger, reviewRunId, {
      diffSource,
      fallbackReason: fallbackReason ?? null,
      diffChars: diffText.length,
      diffFileCount: countFilesInUnifiedDiff(diffText),
      diffTruncated,
      hasCompleteFileIndex: completeFileIndex != null,
      reviewMode: state.reviewMode,
      priorHeadSha: state.priorHeadSha,
      headSha,
    });

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
