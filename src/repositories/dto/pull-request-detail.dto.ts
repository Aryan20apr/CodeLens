import type { PullRequestSummaryDto } from './pull-request-summary.dto';

export interface PullRequestDetailDto extends PullRequestSummaryDto {
  body: string | null;
  merged: boolean;
  draft: boolean;
}
