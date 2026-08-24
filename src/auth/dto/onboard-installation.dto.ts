import { z } from 'zod';

export const OnboardInstallationSchema = z.object({
  installationId: z.number().int().positive(),
});

export type OnboardInstallationDto = z.infer<typeof OnboardInstallationSchema>;
