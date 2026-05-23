import { z } from 'zod';

export const InstallationPayloadSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z
      .object({
        login: z.string().optional(),
        type: z.string().optional(),
      })
      .nullable()
      .optional(),
    suspended_at: z.string().nullable().optional(),
  }),
});

export const PullRequestPayloadSchema = z.object({
  action: z.string(),
  number: z.number(),
  installation: z.object({ id: z.number() }).optional(),
  repository: z.object({ full_name: z.string() }),
  pull_request: z.object({
    head: z.object({ sha: z.string() }),
    base: z.object({ sha: z.string() }),
  }),
});

export const PR_REVIEW_ACTIONS = new Set(['opened', 'reopened', 'synchronize']);
