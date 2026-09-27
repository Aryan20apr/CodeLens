/**
 * Sanitize unescaped control characters inside JSON string literals.
 *
 * In JSON (RFC 8259 Section 9), raw literal control characters (ASCII 0-31,
 * such as literal tabs '\t' or literal newlines '\n') are illegal inside string literals
 * and cause JSON.parse to throw "Bad control character in string literal".
 * Models frequently emit literal tabs when copying code snippets (e.g. from XML/Java).
 */
export function sanitizeJsonString(raw: string): string {
  // Pass 1: Line-aware escape for unescaped internal double quotes in string property values
  const lines = raw.split(/\r?\n/);
  const processedLines: string[] = [];

  for (const line of lines) {
    // Matches a property key and start of string value: e.g. '  "evidenceSnippet": "'
    const propMatch = line.match(/^(\s*"[^"]+"\s*:\s*")(.*)$/);
    if (propMatch) {
      const prefix = propMatch[1];
      const rest = propMatch[2];

      const endMatch = rest.match(/(")(,?\s*)$/);
      if (endMatch && endMatch.index !== undefined) {
        const valContent = rest.slice(0, endMatch.index);
        const suffix = endMatch[0];

        let escapedVal = '';
        let escapeNext = false;
        for (let i = 0; i < valContent.length; i++) {
          const ch = valContent[i];
          if (escapeNext) {
            escapedVal += ch;
            escapeNext = false;
            continue;
          }
          if (ch === '\\') {
            escapedVal += ch;
            escapeNext = true;
            continue;
          }
          if (ch === '"') {
            escapedVal += '\\"';
            continue;
          }
          if (ch === '\t') {
            escapedVal += '\\t';
            continue;
          }
          escapedVal += ch;
        }

        processedLines.push(prefix + escapedVal + suffix);
        continue;
      }
    }

    processedLines.push(line);
  }

  const pass1 = processedLines.join('\n');

  // Pass 2: RFC 8259 Section 9 control characters sanitization for any remaining literal control characters
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < pass1.length; i++) {
    const ch = pass1[i];
    const code = pass1.charCodeAt(i);

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
