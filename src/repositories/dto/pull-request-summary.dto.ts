export interface PullRequestSummaryDto {
  number: number;
  title: string;
  state: string;
  authorLogin: string | null;
  headSha: string;
  baseSha: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}
