import type { PrReviewJobPayload } from '../../jobs/dtos/pr-review-job.dto';
import type { GraphEvent } from '../state.annotation';

export type PrReviewGraphInvokeInput = PrReviewJobPayload;

export type PrReviewGraphInvokeResult = {
  summaryMarkdown: string;
  githubReviewId: string;
  events: GraphEvent[];
};