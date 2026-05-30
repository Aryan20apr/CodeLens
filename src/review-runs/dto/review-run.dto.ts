export interface ReviewRunDto {
  id: string;
  repoFullName: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  triggeredBy: 'WEBHOOK' | 'MANUAL';
  summaryText: string | null;
  githubReviewId: string | null;
  error: string | null;
  currentStep: string | null;
  currentStepMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}
