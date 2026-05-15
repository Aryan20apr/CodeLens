import { SnippetSource } from 'src/graph/state.types';
import { z } from 'zod';

export const EnqueCodeReviewDtoSchema = z.object({
    code: z.string().min(1).max(200_000),
    language: z.string().optional(),
    filename: z.string().optional()
})
export type EnqueueCodeReviewDto = z.infer<typeof EnqueCodeReviewDtoSchema>;


export type CodeReviewJobPayload = {
    threadId: string;
    source: SnippetSource;
  };