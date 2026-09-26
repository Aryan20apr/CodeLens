/**
 * Sanitize unescaped control characters inside JSON string literals.
 *
 * In JSON (RFC 8259 Section 9), raw literal control characters (ASCII 0-31,
 * such as literal tabs '\t' or literal newlines '\n') are illegal inside string literals
 * and cause JSON.parse to throw "Bad control character in string literal".
 * Models frequently emit literal tabs when copying code snippets (e.g. from XML/Java).
 */
export function sanitizeJsonString(raw: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);

    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === '\t') {
        result += '\\t';
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (code < 32) {
        result += '\\u' + code.toString(16).padStart(4, '0');
      } else {
        result += ch;
      }
    } else {
      result += ch;
    }
  }

  return result;
}

/**
 * Extract the first JSON object from an LLM response.
 *
 * Handles:
 * - markdown fences
 * - prose before/after JSON
 * - whitespace/noise
 * - unescaped control characters (tabs, newlines) inside JSON string literals
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
  return sanitizeJsonString(jsonSubstring);
}
