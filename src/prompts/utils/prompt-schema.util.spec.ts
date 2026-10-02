import { z } from 'zod';
import { formatZodSchemaForPrompt } from './prompt-schema.util';

describe('formatZodSchemaForPrompt', () => {
  it('should format a Zod object into a clean JSON Schema string without $schema', () => {
    const TestSchema = z.object({
      summary: z.string().min(5),
      score: z.number().int(),
      tags: z.array(z.string()).optional(),
    });

    const result = formatZodSchemaForPrompt(TestSchema);
    expect(result).not.toContain('$schema');
    expect(result).toContain('"summary"');
    expect(result).toContain('"score"');

    const parsed = JSON.parse(result);
    expect(parsed.type).toBe('object');
    expect(parsed.properties.summary.type).toBe('string');
    expect(parsed.properties.score.type).toBe('integer');
    expect(parsed.$schema).toBeUndefined();
  });
});
