import { DiffChunkerService } from '../../../diff/diff-chunker.service';
import { DiffParserService } from '../../../diff/diff-parser.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import { TerminalReviewError } from '../errors/terminal-review.error';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';

type ChunkUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    | 'parsed'
    | 'chunks'
    | 'fileIndex'
    | 'removedOnlyFileCount'
    | 'binaryOrEmptyFileCount'
    | 'events'
    | 'error'
    | 'status'
  >
>;

export function createChunkNode(
  diffParser: DiffParserService,
  chunker: DiffChunkerService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<ChunkUpdate> {
  return async (state) => {
    if (!state.diffText) {
      return {
        status: 'failed',
        error: 'Missing diffText',
        events: [
          {
            node: 'chunk',
            status: 'failed',
            message: 'Missing diffText',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const { reviewRunId } = state;
    const allEvents: ChunkUpdate['events'] = [];

    const parseStep = await runPrSteps(reviewRunId, progress, [
      {
        step: 'parsing_diff',
        graphNode: 'chunk',
        fn: async () => diffParser.parse(state.diffText!),
      },
    ]);
    allEvents.push(...parseStep.events);
    const parsed = parseStep.result;

    const chunkStep = await runPrSteps(reviewRunId, progress, [
      {
        step: 'chunking',
        graphNode: 'chunk',
        meta: { fileCount: parsed.files.length },
        fn: async () => {
          const built = chunker.buildReviewChunks(parsed);
          if (built.length === 0) {
            throw new TerminalReviewError(
              'No reviewable additions in diff',
              'chunking',
            );
          }
          return built;
        },
      },
    ]);
    allEvents.push(...chunkStep.events);
    const chunks = chunkStep.result;

    return {
      parsed,
      chunks,
      fileIndex: chunker.buildFileIndex(parsed),
      removedOnlyFileCount: chunker.countRemovedOnlyFiles(parsed),
      binaryOrEmptyFileCount: chunker.countBinaryOrEmptyFiles(parsed),
      events: allEvents,
    };
  };
}