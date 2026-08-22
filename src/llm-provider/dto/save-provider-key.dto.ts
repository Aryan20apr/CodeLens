import { z } from 'zod';
import { LlmProvider } from '../../../generated/prisma/client';

export const SaveProviderKeySchema = z.object({
  apiKey: z.string().min(10, 'API key must be at least 10 characters long'),
  nvidiaBaseUrl: z.string().url('Must be a valid URL').optional(),
});

export type SaveProviderKeyDto = z.infer<typeof SaveProviderKeySchema>;
