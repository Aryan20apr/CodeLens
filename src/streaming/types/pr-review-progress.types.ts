export const PR_REVIEW_STEPS = [
  'validating',
  'fetching_pr',
  'fetching_diff',
  'parsing_diff',
  'chunking',
  'enriching_files',
  'summarizing',
  'posting_review',
] as const;

export type PrReviewStep = (typeof PR_REVIEW_STEPS)[number];
export type PrReviewStepStatus = 'started' | 'completed' | 'failed';

export function prReviewChannel(reviewRunId: string): string {
  return `pr-review:${reviewRunId}`;
}

export interface PrReviewStepEvent {
  type: 'step';
  reviewRunId: string;
  step: PrReviewStep;
  status: PrReviewStepStatus;
  message?: string;
  meta?: Record<string, unknown>;
  retrying?: boolean;
  at: string;
}

export interface PrReviewDoneEvent {
  type: 'done';
  reviewRunId: string;
  status: 'COMPLETED' | 'FAILED';
  error?: string;
  at: string;
}

export type PrReviewRedisMessage = PrReviewStepEvent | PrReviewDoneEvent;
