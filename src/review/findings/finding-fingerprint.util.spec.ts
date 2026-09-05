import {
  computeFingerprint,
  stampFingerprints,
} from './finding-fingerprint.util';

describe('finding-fingerprint.util', () => {
  describe('computeFingerprint', () => {
    it('should produce different fingerprints for same snippet in different files', () => {
      // NOTE: The original test asserted fp1 === fp2 here — that was testing the BUG.
      // Cross-file same-snippet MUST produce different fingerprints.
      const finding1 = {
        evidenceSnippet: 'validate(input)',
        title: 'Missing validation',
        filePath: 'src/auth.ts',
        category: 'security' as const,
      };
      const finding2 = {
        evidenceSnippet: 'validate(input)',
        title: 'Missing validation',
        filePath: 'src/database.ts',
        category: 'security' as const,
      };

      const fp1 = computeFingerprint(finding1);
      const fp2 = computeFingerprint(finding2);

      expect(fp1).toHaveLength(40); // SHA-1 hex
      expect(fp2).toHaveLength(40);
      expect(fp1).not.toBe(fp2); // Different files MUST produce different fingerprints
    });

    it('should produce different fingerprints for same snippet in different categories (same file)', () => {
      const finding1 = {
        evidenceSnippet: 'validate(input)',
        title: 'Validation issue A',
        filePath: 'src/auth.ts',
        category: 'security' as const,
      };
      const finding2 = {
        evidenceSnippet: 'validate(input)',
        title: 'Validation issue B',
        filePath: 'src/auth.ts',
        category: 'performance' as const,
      };

      expect(computeFingerprint(finding1)).not.toBe(computeFingerprint(finding2));
    });

    it('should produce the same fingerprint for whitespace-normalized identical findings', () => {
      // Same file + same category + same snippet (only whitespace differs) -> same fingerprint
      const finding1 = {
        evidenceSnippet: '  const x = 1;\n  const y = 2;  ',
        title: 'Unused variable',
        filePath: 'src/app.ts',
        category: 'correctness' as const,
      };
      const finding2 = {
        evidenceSnippet: 'const x = 1;\nconst y = 2;',
        title: 'Different title', // title ignored when snippet present
        filePath: 'src/app.ts',
        category: 'correctness' as const,
      };

      expect(computeFingerprint(finding1)).toBe(computeFingerprint(finding2));
    });

    it('should fall back to filePath + category + title when evidenceSnippet is absent', () => {
      const finding = {
        title: 'Missing return',
        filePath: 'src/user.service.ts',
        category: 'correctness' as const,
      };

      expect(computeFingerprint(finding)).toHaveLength(40);
    });

    it('should produce different fingerprints when filePath is missing vs present', () => {
      const withPath = {
        evidenceSnippet: 'foo()',
        title: 'Issue',
        filePath: 'src/a.ts',
        category: 'security' as const,
      };
      const withoutPath = {
        evidenceSnippet: 'foo()',
        title: 'Issue',
        category: 'security' as const,
      };

      // '' (missing) vs 'src/a.ts' → different hash prefix → different fingerprint
      expect(computeFingerprint(withPath)).not.toBe(computeFingerprint(withoutPath));
    });

    it('should be deterministic across multiple calls', () => {
      const finding = {
        evidenceSnippet: 'return null;',
        title: 'Null return',
        filePath: 'src/service.ts',
        category: 'correctness' as const,
      };

      expect(computeFingerprint(finding)).toBe(computeFingerprint(finding));
    });
  });

  describe('stampFingerprints', () => {
    it('should stamp fingerprints on all findings missing one', () => {
      const findings: Array<{
        id: string;
        title: string;
        filePath: string;
        category: 'security' | 'correctness' | 'performance';
        evidenceSnippet?: string;
        fingerprint?: string;
      }> = [
        {
          id: '1',
          title: 'Issue 1',
          filePath: 'src/a.ts',
          category: 'security',
          evidenceSnippet: 'foo()',
        },
        {
          id: '2',
          title: 'Issue 2',
          filePath: 'src/b.ts',
          category: 'correctness',
        },
        {
          id: '3',
          title: 'Issue 3',
          filePath: 'src/c.ts',
          category: 'performance',
          fingerprint: 'already-existing-fp',
        },
      ];

      const result = stampFingerprints(findings);
      expect(result[0].fingerprint).toBeDefined();
      expect(result[0].fingerprint).toHaveLength(40);
      expect(result[1].fingerprint).toBeDefined();
      expect(result[1].fingerprint).toHaveLength(40);
      expect(result[2].fingerprint).toBe('already-existing-fp'); // Pre-existing preserved
    });

    it('should produce different fingerprints for same snippet in different files', () => {
      const findings: Array<{
        id: string;
        title: string;
        filePath: string;
        category: 'security';
        evidenceSnippet: string;
        fingerprint?: string;
      }> = [
        {
          id: '1',
          title: 'Identical bug',
          filePath: 'src/auth.ts',
          category: 'security',
          evidenceSnippet: 'validate(input)',
        },
        {
          id: '2',
          title: 'Identical bug',
          filePath: 'src/database.ts',
          category: 'security',
          evidenceSnippet: 'validate(input)',
        },
      ];

      const result = stampFingerprints(findings);
      expect(result[0].fingerprint).not.toBe(result[1].fingerprint);
    });
  });
});
