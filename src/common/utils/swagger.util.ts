/**
 * Helper to generate OpenAPI 3.0 compatible response envelope schemas
 * conforming to `ApiResponse<T>`: `{ success: boolean, message: string, data: T }`.
 */
export function apiEnvelopeSchema(
  dataSchema: Record<string, any> | null,
  options?: {
    message?: string;
    description?: string;
  },
): Record<string, any> {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: {
        type: 'string',
        example: options?.message ?? 'Operation successful',
      },
      data: dataSchema ?? {
        type: 'object',
        nullable: true,
        example: null,
      },
    },
    required: ['success', 'message', 'data'],
  };
}

export function apiArrayEnvelopeSchema(
  itemSchema: Record<string, any>,
  options?: {
    message?: string;
    description?: string;
  },
): Record<string, any> {
  return apiEnvelopeSchema(
    {
      type: 'array',
      items: itemSchema,
    },
    options,
  );
}
