import { PrFileEnrichmentService } from '../../../review/enrichment/pr-file-enrichment.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';

type EnrichUpdate = Partial<
  Pick<PrReviewGraphStateType, 'fileContexts' | 'events' | 'error' | 'status'>
>;

export function createEnrichFilesNode(
  enrichment: PrFileEnrichmentService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<EnrichUpdate> {
  return async (state) => {
    if (state.chunks.length === 0) {
      return {
        status: 'failed',
        error: 'Missing chunks for enrichment',
        events: [
          {
            node: 'enrichFiles',
            status: 'failed',
            message: 'Missing chunks for enrichment',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const { reviewRunId, repoFullName, headSha, chunks, installationId } =
      state;
    const fileCount = new Set(chunks.map((c) => c.filePath)).size;

    const { result, events } = await runPrSteps(reviewRunId, progress, [
      {
        step: 'enriching_files',
        graphNode: 'enrichFiles',
        meta: { fileCount },
        fn: () =>
          enrichment.enrich({
            installationId: BigInt(installationId),
            repoFullName,
            headSha,
            chunks,
          }),
      },
    ]);

    return {
      fileContexts: result.fileContexts,
      events,
    };
  };
}
