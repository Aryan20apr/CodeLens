import { resolveReviewEnqueue } from './pr-review-mode.util';

describe('resolveReviewEnqueue', () => {
  const baseInput = {
    headSha: 'head123',
    priorHeadSha: 'prior000',
    incrementalEnabled: true,
    skipIfInFlight: true,
    hasInFlight: false,
  };

  it('skips when in-flight review exists and skipIfInFlight is enabled', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      hasInFlight: true,
    });
    expect(res).toEqual({ kind: 'SKIP_IN_FLIGHT' });
  });

  it('does not skip in-flight if skipIfInFlight is disabled', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      skipIfInFlight: false,
      hasInFlight: true,
    });
    expect(res).toEqual({ kind: 'ENQUEUE', isFullReview: false });
  });

  it('skips when prior head SHA equals current head SHA', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      headSha: 'same123',
      priorHeadSha: 'same123',
    });
    expect(res).toEqual({ kind: 'SKIP_SAME_SHA' });
  });

  it('enqueues FULL review when action is opened', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      action: 'opened',
    });
    expect(res).toEqual({ kind: 'ENQUEUE', isFullReview: true });
  });

  it('enqueues FULL review when action is reopened', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      action: 'reopened',
    });
    expect(res).toEqual({ kind: 'ENQUEUE', isFullReview: true });
  });

  it('enqueues FULL review when there is no prior review', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      priorHeadSha: null,
    });
    expect(res).toEqual({ kind: 'ENQUEUE', isFullReview: true });
  });

  it('enqueues FULL review when incrementalEnabled is false', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      incrementalEnabled: false,
    });
    expect(res).toEqual({ kind: 'ENQUEUE', isFullReview: true });
  });

  it('enqueues incremental review (isFullReview: false) when valid prior exists on synchronize', () => {
    const res = resolveReviewEnqueue({
      ...baseInput,
      action: 'synchronize',
      headSha: 'head123',
      priorHeadSha: 'prior000',
    });
    expect(res).toEqual({ kind: 'ENQUEUE', isFullReview: false });
  });
});
