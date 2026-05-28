import { z } from 'zod';

const installationObjectSchema = z.object({
  id: z.number(),
  account: z
    .object({
      login: z.string().optional(),
      type: z.string().optional(),
    })
    .nullable()
    .optional(),
  suspended_at: z.string().nullable().optional(),
});

const webhookRepoSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  private: z.boolean().optional(),
});

export const InstallationPayloadSchema = z.object({
  action: z.string(),
  installation: installationObjectSchema,
});

export const InstallationRepositoriesPayloadSchema = z.object({
  action: z.string(),
  installation: installationObjectSchema,
  repositories_added: z.array(webhookRepoSchema).optional(),
  repositories_removed: z.array(webhookRepoSchema).optional(),
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
