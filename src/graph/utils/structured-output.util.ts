import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { extractTextFromLlmContent } from '../../review/context/llm-content.util';
import { extractJson } from './extract-json.util';
import { formatZodSchemaForPrompt } from '../../prompts/utils/prompt-schema.util';

export type StructuredOutputResult<T> = {
  parsed: T;
  raw: AIMessage;
};

export type StructuredOutputOptions = {
  name?: string;
  method?:
    | 'functionCalling'
    | 'jsonSchema'
    | 'jsonMode'
    | 'function_calling'
    | 'json_schema';
  callOptions?: Record<string, unknown>;
};

/**
 * Repairs malformed or schema-violating JSON output using an LLM self-correction turn.
 * Follows the industry-standard OutputFixingParser pattern (LangChain / Instructor / Guardrails).
 */
export async function repairJsonWithLlm<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  invalidRawText: string,
  error: unknown,
  callOptions?: Record<string, unknown>,
): Promise<StructuredOutputResult<T>> {
  let errorDetails: string;
  if (error instanceof z.ZodError) {
    errorDetails = error.issues
      .map(
        (issue) =>
          `- Path "${issue.path.join('.')}": ${issue.message} (code: ${issue.code})`,
      )
      .join('\n');
  } else if (error instanceof Error) {
    errorDetails = error.message;
  } else {
    errorDetails = String(error);
  }

  const repairPrompt = [
    new HumanMessage(
      `Your previous JSON response was invalid and failed schema validation:

ERROR DETAILS:
${errorDetails}

TARGET JSON SCHEMA:
${formatZodSchemaForPrompt(schema)}

YOUR PREVIOUS RESPONSE:
${invalidRawText}

INSTRUCTIONS:
1. Fix all validation errors, enum mismatches, and JSON syntax issues identified above.
2. Return ONLY the repaired, valid JSON object matching the target schema.
3. Do not include markdown code fences, commentary, or explanation. Begin with { and end with }.`,
    ),
  ];

  const repairedMsg = await model.invoke(repairPrompt, callOptions);
  const text = extractTextFromLlmContent(repairedMsg.content);
  const jsonStr = extractJson(text);
  const parsedJson = JSON.parse(jsonStr);
  const validated = schema.parse(parsedJson);

  return {
    parsed: validated,
    raw:
      repairedMsg instanceof AIMessage
        ? repairedMsg
        : new AIMessage({ content: text }),
  };
}

/**
 * Invokes a chat model enforcing structured output conforming to a Zod schema.
 * Configured with `includeRaw: true` so the raw AIMessage (token usage, reasoning_content,
 * finish_reason) is preserved alongside typed parsed data.
 *
 * Defaults to `method: "functionCalling"` for cross-provider compatibility (OpenAI, Gemini, Groq, NVIDIA NIM).
 * Includes graceful fallback to schema-injected text + extractJson + self-correction repair loop
 * if an exotic endpoint rejects tool calling or produces invalid output.
 */
export async function invokeWithStructuredOutput<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  input: any,
  options?: StructuredOutputOptions,
): Promise<StructuredOutputResult<T>> {
  const rawMethod = options?.method ?? 'functionCalling';
  const method: 'functionCalling' | 'jsonSchema' | 'jsonMode' =
    rawMethod === 'function_calling'
      ? 'functionCalling'
      : rawMethod === 'json_schema'
        ? 'jsonSchema'
        : rawMethod;
  const name = options?.name ?? 'structured_output';

  // Helper to parse or repair raw text from a model message
  async function parseOrRepairRawText(
    text: string,
    rawMsg: AIMessage,
  ): Promise<StructuredOutputResult<T>> {
    try {
      const jsonStr = extractJson(text);
      const parsedJson = JSON.parse(jsonStr);
      const validated = schema.parse(parsedJson);
      return { parsed: validated, raw: rawMsg };
    } catch (parseOrValidationError) {
      // Tier 3: OutputFixing repair loop - pass exact error back to LLM to fix its own output
      return await repairJsonWithLlm(
        model,
        schema,
        text,
        parseOrValidationError,
        options?.callOptions,
      );
    }
  }

  // Tier 1: Attempt native structured output
  try {
    const structuredModel = model.withStructuredOutput(schema, {
      name,
      method,
      includeRaw: true,
    } as any);

    const result = await structuredModel.invoke(input, options?.callOptions);

    if (result && typeof result === 'object' && 'raw' in result) {
      const rawMsg = result.raw as AIMessage;
      // If LangChain successfully extracted and parsed the tool call:
      if (result.parsed != null) {
        return { parsed: result.parsed as T, raw: rawMsg };
      }

      // If LangChain returned parsed: null / undefined (e.g. model outputted JSON in content instead of tool_calls):
      const rawText = extractTextFromLlmContent(rawMsg.content);
      if (rawText.trim()) {
        return await parseOrRepairRawText(rawText.trim(), rawMsg);
      }
    } else if (result != null && (result as any).parsed != null) {
      return {
        parsed: (result as any).parsed as T,
        raw: new AIMessage({ content: JSON.stringify((result as any).parsed) }),
      };
    } else if (result != null && typeof result === 'object' && !('raw' in result)) {
      return {
        parsed: result as T,
        raw: new AIMessage({ content: JSON.stringify(result) }),
      };
    }
  } catch (_nativeError) {
    // Provider rejected tool calling or structured output parameters; proceed to fallback below
  }

  // Tier 2: Schema-injected text fallback
  const fallbackInstruction = `Return ONLY a valid JSON object matching the following schema. No markdown formatting, no code fences. Output raw JSON starting with { and ending with }.

Schema:
${formatZodSchemaForPrompt(schema)}`;

  let fallbackInput: any;
  if (Array.isArray(input)) {
    fallbackInput = [...input, new HumanMessage(fallbackInstruction)];
  } else if (typeof input === 'string') {
    fallbackInput = `${input}\n\n${fallbackInstruction}`;
  } else {
    fallbackInput = input;
  }

  const rawMsg = await model.invoke(fallbackInput, options?.callOptions);
  const text = extractTextFromLlmContent(rawMsg.content);
  const rawAiMessage =
    rawMsg instanceof AIMessage ? rawMsg : new AIMessage({ content: text });

  return await parseOrRepairRawText(text, rawAiMessage);
}
