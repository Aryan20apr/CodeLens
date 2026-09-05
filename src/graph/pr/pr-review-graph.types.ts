import type { PrReviewJobPayload } from '../../jobs/dtos/pr-review-job.dto';
import type { GraphEvent } from '../state.annotation';
import type { Finding } from '../state.types';

export type PrReviewGraphInvokeInput = PrReviewJobPayload & {
  previousReview?: {
    reviewRunId: string;
    headSha: string;
    baseSha: string;
    findings: Finding[];
  } | null;
  isIncrementalReview?: boolean;
};

export type PrReviewGraphInvokeResult = {
  summaryMarkdown: string;
  githubReviewId: string;
  events: GraphEvent[];
  validatedFindings: Finding[];
};