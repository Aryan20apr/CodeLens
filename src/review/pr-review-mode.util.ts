export type ReviewEnqueueDecision =
  | { kind: 'SKIP_IN_FLIGHT' }
  | { kind: 'SKIP_SAME_SHA' }
  | { kind: 'ENQUEUE'; isFullReview: boolean };

export function resolveReviewEnqueue(input: {
  action?: string;
  headSha: string;
  priorHeadSha: string | null;
  incrementalEnabled: boolean;
  skipIfInFlight: boolean;
  hasInFlight: boolean;
  forceFull?: boolean;
}): ReviewEnqueueDecision {
  if (input.skipIfInFlight && input.hasInFlight) {
    return { kind: 'SKIP_IN_FLIGHT' };
  }

  if (input.priorHeadSha === input.headSha) {
    return { kind: 'SKIP_SAME_SHA' };
  }

  const fullReviewAction =
    input.action === 'opened' || input.action === 'reopened';

  if (
    !input.priorHeadSha ||
    fullReviewAction ||
    input.forceFull ||
    !input.incrementalEnabled
  ) {
    return {
      kind: 'ENQUEUE',
      isFullReview: true,
    };
  }

  return {
    kind: 'ENQUEUE',
    isFullReview: false,
  };
}
