export type PrReviewJobPayload = {
  deliveryId: string;
  reviewRunId: string;
  installationId: string;
  repoFullName: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
};
