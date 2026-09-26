import { z } from 'zod';
import { AIMessage } from '@langchain/core/messages';
import { invokeWithStructuredOutput } from './structured-output.util';

describe('invokeWithStructuredOutput', () => {
  const SampleSchema = z.object({
    status: z.enum(['ok', 'error']),
    items: z.array(z.string()),
    snippet: z.string().optional(),
  });

  it('invokes model with structured output and returns both parsed and raw AIMessage', async () => {
    const mockRaw = new AIMessage({
      content: '',
      response_metadata: {
        tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      },
    });

    const mockStructuredModel = {
      invoke: jest.fn().mockResolvedValue({
        raw: mockRaw,
        parsed: { status: 'ok', items: ['a', 'b'] },
      }),
    };

    const mockModel = {
      withStructuredOutput: jest.fn().mockReturnValue(mockStructuredModel),
    } as any;

    const result = await invokeWithStructuredOutput(mockModel, SampleSchema, 'Test prompt', {
      name: 'sample_tool',
    });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(SampleSchema, {
      name: 'sample_tool',
      method: 'function_calling',
      includeRaw: true,
    });
    expect(result.parsed).toEqual({ status: 'ok', items: ['a', 'b'] });
    expect(result.raw).toBe(mockRaw);
    expect((result.raw.response_metadata as any).tokenUsage.totalTokens).toBe(120);
  });

  it('falls back to text invocation + extractJson if provider rejects structured output with parameter error', async () => {
    // Simulates an unescaped literal tab inside code snippet evidence in fallback mode
    const mockRaw = new AIMessage({
      content:
        '```json\n{"status": "ok", "items": ["fallback"], "snippet": "\t\t<java.version>16</java.version>"}\n```',
      response_metadata: {
        tokenUsage: { promptTokens: 100, completionTokens: 15, totalTokens: 115 },
      },
    });

    const mockModel = {
      withStructuredOutput: jest.fn().mockImplementation(() => {
        throw new Error('400 Invalid parameter: response_format / tools not supported');
      }),
      invoke: jest.fn().mockResolvedValue(mockRaw),
    } as any;

    const result = await invokeWithStructuredOutput(mockModel, SampleSchema, 'Test prompt');

    expect(result.parsed.status).toBe('ok');
    expect(result.parsed.snippet).toBe('\t\t<java.version>16</java.version>');
    expect(result.raw).toBe(mockRaw);
  });
});
