import { z } from "zod";
import { ApiProperty } from '@nestjs/swagger';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  name: z.string().min(1).max(100).optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;