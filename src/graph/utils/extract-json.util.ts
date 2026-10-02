import { jsonrepair } from 'jsonrepair';

/**
 * Extract and repair the first JSON object from an LLM response.
 *
 * Uses `jsonrepair` to handle:
 * - markdown code fences
 * - prose surrounding JSON
 * - unescaped control characters (tabs, newlines) inside strings
 * - unescaped quotes inside strings
 * - trailing commas, comments, and unquoted keys
 */
export function extractJson(text: string): string {
  let cleaned = text.trim();

  // remove markdown fences
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON object found in model response');
  }

  const jsonSubstring = cleaned.slice(firstBrace, lastBrace + 1);
  return jsonrepair(jsonSubstring);
}
