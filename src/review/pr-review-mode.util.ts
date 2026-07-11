import { ReviewMode } from '../../generated/prisma/client';

export type ReviewEnqueueDecision =
  | { kind: 'SKIP_IN_FLIGHT' }
  | { kind: 'SKIP_SAME_SHA' }
  | {
      kind: 'ENQUEUE';
      reviewMode: ReviewMode;
      priorHeadSha: string | null;
      parentRunId: string | null;
    };

export function resolveReviewEnqueue(input: {
  action?: string;
  headSha: string;
  prior: { id: string; headSha: string } | null;
  incrementalEnabled: boolean;
  skipIfInFlight: boolean;
  hasInFlight: boolean;
  forceFull?: boolean;
}): ReviewEnqueueDecision {
  if (input.skipIfInFlight && input.hasInFlight) {
    return { kind: 'SKIP_IN_FLIGHT' };
  }

  if (input.prior?.headSha === input.headSha) {
    return { kind: 'SKIP_SAME_SHA' };
  }

  const fullReviewAction =
    input.action === 'opened' || input.action === 'reopened';

  if (
    !input.prior ||
    fullReviewAction ||
    input.forceFull ||
    !input.incrementalEnabled
  ) {
    return {
      kind: 'ENQUEUE',
      reviewMode: ReviewMode.FULL,
      priorHeadSha: null,
      parentRunId: null,
    };
  }

  return {
    kind: 'ENQUEUE',
    reviewMode: ReviewMode.INCREMENTAL,
    priorHeadSha: input.prior.headSha,
    parentRunId: input.prior.id,
  };
}
