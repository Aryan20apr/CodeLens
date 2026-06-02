import type { PrReviewProgressPublisher } from '../../streaming/pr-review-progress-publisher.service';
import type {
  PrReviewStep,
} from '../../streaming/types/pr-review-progress.types';
import type { GraphEvent } from '../state.annotation';
import { TerminalReviewError } from './errors/terminal-review.error';


const now = () => new Date().toISOString();

export type PrStepSpec<T> = {
    step: PrReviewStep;
    graphNode: string;
    message?: string;
    meta?: Record<string, unknown>;
    fn: () => Promise<T>;
};

export async function runPrSteps<T>(
    reviewRunId: string,
    progress: PrReviewProgressPublisher,
    specs: PrStepSpec<T>[],
  ): Promise<{ result: T; events: GraphEvent[] }> {
    const events: GraphEvent[] = [];
    let lastResult: T | undefined;
  
    for (const spec of specs) {
      events.push({
        node: spec.graphNode,
        status: 'started',
        message: spec.message ?? spec.step,
        at: now(),
      });
      await progress.stepStarted(
        reviewRunId,
        spec.step,
        spec.message,
        spec.meta,
      );
  
      try {
        lastResult = await spec.fn();
        events.push({
          node: spec.graphNode,
          status: 'completed',
          message: spec.step,
          at: now(),
        });
        await progress.stepCompleted(reviewRunId, spec.step, spec.meta);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        events.push({
          node: spec.graphNode,
          status: 'failed',
          message,
          at: now(),
        });
        if (err instanceof TerminalReviewError) {
          await progress.stepFailed(reviewRunId, err.step, message);
          throw err;
        }
        await progress.stepFailed(reviewRunId, spec.step, message);
        throw err;
      }
    }
  
    return { result: lastResult as T, events };
  }
