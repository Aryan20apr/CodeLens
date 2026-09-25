import { z } from 'zod';

/**
 * Converts a Zod schema into a clean, formatted JSON Schema string
 * stripped of root $schema boilerplate for LLM system prompt instructions.
 */
export function formatZodSchemaForPrompt(schema: z.ZodTypeAny): string {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema, ...cleanSchema } = jsonSchema;
  return JSON.stringify(cleanSchema, null, 2);
}
