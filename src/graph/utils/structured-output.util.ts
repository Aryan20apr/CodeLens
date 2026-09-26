import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import { extractTextFromLlmContent } from '../../review/context/llm-content.util';
import { extractJson } from './extract-json.util';

export type StructuredOutputResult<T> = {
  parsed: T;
  raw: AIMessage;
};

export type StructuredOutputOptions = {
  name?: string;
  method?: 'function_calling' | 'json_schema';
  callOptions?: Record<string, unknown>;
};

/**
 * Invokes a chat model enforcing structured output conforming to a Zod schema.
 * Configured with `includeRaw: true` so the raw AIMessage (token usage, reasoning_content,
 * finish_reason) is preserved alongside typed parsed data.
 *
 * Defaults to `method: "function_calling"` for cross-provider compatibility (OpenAI, Gemini, Groq, NVIDIA NIM).
 * Includes graceful fallback to text + extractJson (with RFC 8259 control-character sanitization)
 * if an exotic endpoint rejects tool calling.
 */
export async function invokeWithStructuredOutput<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  input: any,
  options?: StructuredOutputOptions,
): Promise<StructuredOutputResult<T>> {
  const method = options?.method ?? 'function_calling';
  const name = options?.name ?? 'structured_output';

  try {
    const structuredModel = model.withStructuredOutput(schema, {
      name,
      method,
      includeRaw: true,
    } as any);

    const result = await structuredModel.invoke(input, options?.callOptions);

    // LangChain returns { raw: AIMessage, parsed: T } when includeRaw is true
    if (result && typeof result === 'object' && 'raw' in result && 'parsed' in result) {
      const parsedVal = result.parsed as T;
      const rawMsg = result.raw as AIMessage;
      return { parsed: parsedVal, raw: rawMsg };
    }

    // Direct parsed return fallback
    return {
      parsed: result as T,
      raw: new AIMessage({ content: JSON.stringify(result) }),
    };
  } catch (error) {
    // If provider rejected tool calling or structured output parameters, attempt text fallback
    const rawMsg = await model.invoke(input, options?.callOptions);
    const text = extractTextFromLlmContent(rawMsg.content);
    const jsonStr = extractJson(text);
    const parsedJson = JSON.parse(jsonStr);
    const validated = schema.parse(parsedJson);

    return {
      parsed: validated,
      raw: rawMsg instanceof AIMessage ? rawMsg : new AIMessage({ content: text }),
    };
  }
}
