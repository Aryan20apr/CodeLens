import { z } from 'zod';

export const PrReviewContextSchema = z.object({
  installationId: z.string().describe('GitHub App installation ID (as string)'),
  repoFullName: z.string().describe('Repository full name (owner/repo)'),
  headSha: z.string().describe('Commit SHA being reviewed'),
  reviewRunId: z.string().describe('Unique ID for the PR review run'),
});

export type PrReviewContext = z.infer<typeof PrReviewContextSchema>;
