export type PrReviewJobPayload = {
  deliveryId?: string;
  reviewRunId: string;
  installationId: string;
  repoFullName: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  reviewMode: 'FULL' | 'INCREMENTAL';
  priorHeadSha?: string;
  parentRunId?: string;
};
