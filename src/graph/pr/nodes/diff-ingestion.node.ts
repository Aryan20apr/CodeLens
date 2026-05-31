import {
    GithubApiService,
    MAX_DIFF_CHARS,
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
    | 'apiFileIndex'
    | 'status'
    | 'error'
    | 'events'
  >
>;


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
  
      const diffStep = await runPrSteps(reviewRunId, progress, [
        {
          step: 'fetching_diff',
          graphNode: 'ingestDiff',
          fn: async () => {
            const text = await github.getPullRequestDiff(
              installationId,
              repoFullName,
              prNumber,
            );
            const truncated =
              text.includes(`[Diff truncated at ${MAX_DIFF_CHARS}`) ||
              text.length >= MAX_DIFF_CHARS;
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