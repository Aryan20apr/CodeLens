// src/graph/utils/extract-json.util.ts

/**
 * Extract the first JSON object from an LLM response.
 *
 * Handles:
 * - markdown fences
 * - prose before/after JSON
 * - whitespace/noise
 */
export function extractJson(text: string): string {
    let cleaned = text.trim();
  
    // remove markdown fences
    cleaned = cleaned.replace(/^```json\s*/i, "");
    cleaned = cleaned.replace(/^```\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/, "");
  
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
  
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("No JSON object found in model response");
    }
  
    return cleaned.slice(firstBrace, lastBrace + 1);
  }