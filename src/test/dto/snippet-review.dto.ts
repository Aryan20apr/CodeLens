import { z } from "zod";

export const SnippetEvaluateDtoSchema = z.object({
    code: z.string().min(1).max(200_0000),
    language: z.string().optional(),
    filename: z.string().optional(),
    threadId: z.string().optional()
});

export type SnippetReviewDto = z.infer<typeof SnippetEvaluateDtoSchema>;