import { z } from 'zod';
import { AIMessage } from '@langchain/core/messages';
import {
  invokeWithStructuredOutput,
  repairJsonWithLlm,
} from './structured-output.util';

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
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        },
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

    const result = await invokeWithStructuredOutput(
      mockModel,
      SampleSchema,
      'Test prompt',
      {
        name: 'sample_tool',
      },
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(SampleSchema, {
      name: 'sample_tool',
      method: 'functionCalling',
      includeRaw: true,
    });
    expect(result.parsed).toEqual({ status: 'ok', items: ['a', 'b'] });
    expect(result.raw).toBe(mockRaw);
    expect((result.raw.response_metadata as any).tokenUsage.totalTokens).toBe(
      120,
    );
  });

  it('normalizes legacy function_calling option to functionCalling', async () => {
    const mockRaw = new AIMessage({ content: '' });
    const mockStructuredModel = {
      invoke: jest.fn().mockResolvedValue({
        raw: mockRaw,
        parsed: { status: 'ok', items: [] },
      }),
    };
    const mockModel = {
      withStructuredOutput: jest.fn().mockReturnValue(mockStructuredModel),
    } as any;

    await invokeWithStructuredOutput(mockModel, SampleSchema, 'Test', {
      method: 'function_calling',
    });

    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(SampleSchema, {
      name: 'structured_output',
      method: 'functionCalling',
      includeRaw: true,
    });
  });

  it('falls back to text invocation with injected schema if provider rejects structured output', async () => {
    const mockRaw = new AIMessage({
      content:
        '```json\n{"status": "ok", "items": ["fallback"], "snippet": "\t\t<java.version>16</java.version>"}\n```',
      response_metadata: {
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 15,
          totalTokens: 115,
        },
      },
    });

    let invokedPrompt: any = null;
    const mockModel = {
      withStructuredOutput: jest.fn().mockImplementation(() => {
        throw new Error(
          '400 Invalid parameter: response_format / tools not supported',
        );
      }),
      invoke: jest.fn().mockImplementation((input: any) => {
        invokedPrompt = input;
        return Promise.resolve(mockRaw);
      }),
    } as any;

    const result = await invokeWithStructuredOutput(
      mockModel,
      SampleSchema,
      'Test prompt',
    );

    expect(result.parsed.status).toBe('ok');
    expect(result.parsed.snippet).toBe('\t\t<java.version>16</java.version>');
    expect(result.raw).toBe(mockRaw);
    // Verifies that the fallback prompt was injected with schema instruction
    expect(invokedPrompt).toContain('Schema:');
  });

  it('triggers repairJsonWithLlm if fallback text response fails validation', async () => {
    // 1st call fails schema validation (invalid enum value 'pending')
    const invalidRaw = new AIMessage({
      content: '{"status": "pending", "items": ["initial"]}',
    });

    // 2nd call (repair call) fixes the issue
    const repairedRaw = new AIMessage({
      content: '{"status": "ok", "items": ["repaired"]}',
    });

    let callCount = 0;
    const mockModel = {
      withStructuredOutput: jest.fn().mockImplementation(() => {
        throw new Error('Native structured output rejected');
      }),
      invoke: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(invalidRaw);
        return Promise.resolve(repairedRaw);
      }),
    } as any;

    const result = await invokeWithStructuredOutput(
      mockModel,
      SampleSchema,
      'Initial prompt',
    );

    expect(callCount).toBe(2);
    expect(result.parsed.status).toBe('ok');
    expect(result.parsed.items).toEqual(['repaired']);
  });

  it('repairJsonWithLlm passes validation errors and schema to model for self-correction', async () => {
    const invalidText = '{"status": "invalid_value", "items": []}';
    let repairPromptContent = '';

    const mockRepairMsg = new AIMessage({
      content: '{"status": "ok", "items": ["repaired_item"]}',
    });

    const mockModel = {
      invoke: jest.fn().mockImplementation((prompt: any) => {
        repairPromptContent = prompt[0].content;
        return Promise.resolve(mockRepairMsg);
      }),
    } as any;

    const zodError = new z.ZodError([
      {
        code: 'invalid_value',
        values: ['ok', 'error'],
        path: ['status'],
        message: "Invalid enum value. Expected 'ok' | 'error', received 'invalid_value'",
      },
    ]);

    const result = await repairJsonWithLlm(
      mockModel,
      SampleSchema,
      invalidText,
      zodError,
    );

    expect(result.parsed.status).toBe('ok');
    expect(result.parsed.items).toEqual(['repaired_item']);
    expect(repairPromptContent).toContain('ERROR DETAILS:');
    expect(repairPromptContent).toContain('Path "status"');
    expect(repairPromptContent).toContain('TARGET JSON SCHEMA:');
  });

  it('recovers and validates JSON from raw.content when withStructuredOutput returns parsed: null (content-only response)', async () => {
    const mockRaw = new AIMessage({
      content: JSON.stringify({ status: 'ok', items: ['from_content'] }),
      tool_calls: [],
    });

    const mockStructuredModel = {
      invoke: jest.fn().mockResolvedValue({
        raw: mockRaw,
        parsed: null, // Simulates LangChain JsonOutputKeyToolsParser returning null when tool_calls is empty
      }),
    };

    const mockModel = {
      withStructuredOutput: jest.fn().mockReturnValue(mockStructuredModel),
    } as any;

    const result = await invokeWithStructuredOutput(
      mockModel,
      SampleSchema,
      'Test prompt',
    );

    expect(result.parsed).toEqual({ status: 'ok', items: ['from_content'] });
    expect(result.raw).toBe(mockRaw);
  });

  it('repairs JSON from raw.content when withStructuredOutput returns parsed: null and raw.content has a syntax defect', async () => {
    // Simulates double open brace like {\n{\t"status": ... emitted in content
    const invalidContent = '{\n{\t"status": "ok", "items": ["repaired_content"]}';
    const mockRaw = new AIMessage({
      content: invalidContent,
      tool_calls: [],
    });

    const mockRepaired = new AIMessage({
      content: JSON.stringify({ status: 'ok', items: ['repaired_content'] }),
    });

    const mockStructuredModel = {
      invoke: jest.fn().mockResolvedValue({
        raw: mockRaw,
        parsed: null,
      }),
    };

    const mockModel = {
      withStructuredOutput: jest.fn().mockReturnValue(mockStructuredModel),
      invoke: jest.fn().mockResolvedValue(mockRepaired),
    } as any;

    const result = await invokeWithStructuredOutput(
      mockModel,
      SampleSchema,
      'Test prompt',
    );

    expect(result.parsed).toEqual({ status: 'ok', items: ['repaired_content'] });
  });
});

