import { extractJson } from './extract-json.util';

describe('extractJson', () => {
  it('extracts plain JSON object', () => {
    const input = '{"summary": "Test summary", "findings": []}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({
      summary: 'Test summary',
      findings: [],
    });
  });

  it('removes ```json markdown code fences', () => {
    const input = '```json\n{"summary": "Test summary", "findings": []}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({
      summary: 'Test summary',
      findings: [],
    });
  });

  it('removes prose surrounding JSON', () => {
    const input =
      'Here is the analysis:\n\n{"summary": "Test summary", "findings": []}\n\nHope this helps!';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({
      summary: 'Test summary',
      findings: [],
    });
  });

  it('sanitizes unescaped literal tabs inside string literals', () => {
    // Literal tab inside evidenceSnippet string literal
    const input =
      '{"findings": [{"evidenceSnippet": "\t\t<java.version>16</java.version>"}]}';
    // Without sanitization, JSON.parse(input) throws "Bad control character in string literal"
    expect(() => JSON.parse(input)).toThrow();

    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.findings[0].evidenceSnippet).toBe(
      '\t\t<java.version>16</java.version>',
    );
  });

  it('sanitizes unescaped literal newlines inside string literals', () => {
    const input = '{"findings": [{"description": "Line 1\nLine 2"}]}';
    expect(() => JSON.parse(input)).toThrow();

    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.findings[0].description).toBe('Line 1\nLine 2');
  });

  it('preserves escaped quotes and backslashes properly', () => {
    const input =
      '{"findings": [{"description": "Has \\"escaped quotes\\" and \\\\backslashes\\\\"}]}';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.findings[0].description).toBe(
      'Has "escaped quotes" and \\backslashes\\',
    );
  });

  it('repairs unescaped quotes inside string values', () => {
    const input =
      '{"findings": [{"description": "Found a "critical" issue here"}]}';
    expect(() => JSON.parse(input)).toThrow();

    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.findings[0].description).toBe(
      'Found a "critical" issue here',
    );
  });

  it('repairs trailing commas and unquoted keys', () => {
    const input = '{ summary: "Test summary", findings: [], }';
    const result = extractJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBe('Test summary');
  });

  it('throws an error if no JSON object is found', () => {
    expect(() => extractJson('Just plain text')).toThrow(
      'No JSON object found in model response',
    );
  });
});
