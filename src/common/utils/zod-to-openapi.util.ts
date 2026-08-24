import { z } from 'zod';

/**
 * Converts a Zod schema into an OpenAPI 3.0 compatible SchemaObject
 * for use in NestJS Swagger `@ApiBody({ schema: zodToOpenApi(...) })` decorators.
 */
export function zodToOpenApi(schema: z.ZodType): Record<string, any> {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as Record<string, any>;
}
