import { FindingSchema, parseLlmAnalysis } from './parse-llm-analysis.util';

describe('parse-llm-analysis.util', () => {
  describe('FindingSchema', () => {
    it('accepts valid enum values for category, severity, and confidence', () => {
      const validFinding = {
        category: 'security',
        severity: 'critical',
        title: 'Hardcoded API Key',
        description: 'Plaintext secret key detected in source code.',
        location: { startLine: 12, endLine: 14 },
        confidence: 'high',
      };

      const parsed = FindingSchema.parse(validFinding);
      expect(parsed.category).toBe('security');
      expect(parsed.severity).toBe('critical');
      expect(parsed.confidence).toBe('high');
      expect(parsed.location.startLine).toBe(12);
    });

    it('coerces string line numbers to numbers', () => {
      const validFinding = {
        category: 'correctness',
        severity: 'warning',
        title: 'Potential null pointer',
        description: 'Variable may be null when dereferenced.',
        location: { startLine: '42', endLine: '45' },
        confidence: 'medium',
      };

      const parsed = FindingSchema.parse(validFinding);
      expect(parsed.location.startLine).toBe(42);
      expect(parsed.location.endLine).toBe(45);
    });

    it('rejects invalid enum values strictly so the repair loop can catch them', () => {
      const invalidFinding = {
        category: 'security',
        severity: 'high', // Invalid: schema strictly expects 'critical' | 'warning' | 'info'
        title: 'Hardcoded API Key',
        description: 'Plaintext secret key detected in source code.',
        location: { startLine: 12, endLine: 14 },
        confidence: 'high',
      };

      expect(() => FindingSchema.parse(invalidFinding)).toThrow();
    });
  });

  describe('parseLlmAnalysis', () => {
    it('successfully parses valid findings', () => {
      const rawJson = JSON.stringify({
        summary: 'Executive summary with at least ten characters.',
        findings: [
          {
            category: 'security',
            severity: 'critical',
            title: 'Hardcoded secret',
            description: 'Hardcoded secret in source code.',
            location: { startLine: 10, endLine: 12 },
            confidence: 'high',
          },
          {
            category: 'correctness',
            severity: 'warning',
            title: 'Token calculation overflow',
            description: 'Token calculation multiplies validity incorrectly.',
            location: { startLine: 20, endLine: 22 },
            confidence: 'high',
          },
        ],
      });

      const result = parseLlmAnalysis(rawJson);
      expect(result.summary).toBe(
        'Executive summary with at least ten characters.',
      );
      expect(result.findings).toHaveLength(2);
      expect(result.findings[0].severity).toBe('critical');
      expect(result.findings[1].severity).toBe('warning');
      expect(result.findings[0].id).toBeDefined();
    });

    it('throws when JSON is invalid or missing required fields', () => {
      expect(() => parseLlmAnalysis('not json')).toThrow(
        'LLM did not return valid JSON',
      );
      expect(() =>
        parseLlmAnalysis(JSON.stringify({ summary: 'Too short' })),
      ).toThrow();
    });
  });
});
