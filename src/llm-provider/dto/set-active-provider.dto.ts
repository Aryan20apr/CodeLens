import { z } from 'zod';
import { LlmProvider } from '../../../generated/prisma/client';

export const SetActiveProviderSchema = z.object({
  provider: z.nativeEnum(LlmProvider),
  model: z.string().min(1, 'Model is required'),
});

export type SetActiveProviderDto = z.infer<typeof SetActiveProviderSchema>;
