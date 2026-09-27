import {
  parsePrLlmAnalysis,
  parsePrLlmAnalysisWithRepair,
} from './pr-finding.schema';

describe('pr-finding.schema', () => {
  it('parses valid PR review findings strictly conforming to schema', () => {
    const raw = JSON.stringify({
      summary:
        'Reviewed all changed files in the pull request with thorough evaluation.',
      findings: [
        {
          filePath: 'src/main/java/JwtTokenHelper.java',
          category: 'security',
          severity: 'critical',
          title: 'Hardcoded JWT secret key',
          description:
            'The JWT secret key is hardcoded directly in the source file.',
          location: { startLine: 20, endLine: 20 },
          confidence: 'high',
        },
        {
          filePath: 'src/main/java/JwtAuthenticationFilter.java',
          category: 'maintainability',
          severity: 'warning',
          title: 'Console logging in filter',
          description:
            'Excessive console logging statements found in production code.',
          location: { startLine: 41, endLine: 46 },
          confidence: 'medium',
        },
      ],
    });

    const result = parsePrLlmAnalysis(raw);
    expect(result.summary).toBeDefined();
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[1].severity).toBe('warning');
  });

  it('triggers repair callback when validation fails and returns repaired result', async () => {
    const invalidRaw = JSON.stringify({
      summary: 'Reviewed changes.',
      findings: [
        {
          filePath: 'src/main/java/JwtTokenHelper.java',
          category: 'security',
          severity: 'high', // Invalid enum: should be 'critical'
          title: 'JWT expiration calculation overflow',
          description:
            'Expiration milliseconds multiplied by 1000 causing overflow.',
          location: { startLine: 64, endLine: 64 },
          confidence: 'high',
        },
      ],
    });

    const repairedRaw = JSON.stringify({
      summary: 'Reviewed changes thoroughly.',
      findings: [
        {
          filePath: 'src/main/java/JwtTokenHelper.java',
          category: 'security',
          severity: 'critical', // Corrected
          title: 'JWT expiration calculation overflow',
          description:
            'Expiration milliseconds multiplied by 1000 causing overflow.',
          location: { startLine: 64, endLine: 64 },
          confidence: 'high',
        },
      ],
    });

    let repairHintReceived = '';
    const repairInvoke = jest.fn(async (hint: string) => {
      repairHintReceived = hint;
      return repairedRaw;
    });

    const result = await parsePrLlmAnalysisWithRepair(
      invalidRaw,
      repairInvoke,
    );

    expect(repairInvoke).toHaveBeenCalledTimes(1);
    expect(repairHintReceived).toContain('Validation error');
    expect(repairHintReceived).toContain('findings.0.severity');
    expect(result.findings[0].severity).toBe('critical');
  });

  it('parses dirty LLM output containing unescaped control characters, comments, and trailing commas via jsonrepair', () => {
    const raw = [
      '```json',
      '{',
      '  "summary": "This PR implements JWT authentication.\\nVerified all security configs.",',
      '  "findings": [',
      '    {',
      '      "filePath": "src/main/java/SecurityConfig.java",',
      '      "category": "maintainability",',
      '      "severity": "info",',
      '      "title": "Swagger endpoints commented out in PUBLIC_URLS",',
      '      "description": "Endpoints are commented out in configuration array.",',
      '      "location": { "startLine": 67, "endLine": 70 },',
      '      "evidenceSnippet": "\\t\\tpublic static final String[] PUBLIC_URLS = {};",',
      '      "confidence": "medium",',
      '    },',
      '  ],',
      '}',
      '```',
    ].join('\n');

    const result = parsePrLlmAnalysis(raw);
    expect(result.summary).toBeDefined();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe(
      'src/main/java/SecurityConfig.java',
    );
  });
});
