import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  name: z.string().max(100).optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
