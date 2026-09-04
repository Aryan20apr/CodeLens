import {
  computeFingerprint,
  stampFingerprints,
} from './finding-fingerprint.util';

describe('finding-fingerprint.util', () => {
  it('should compute deterministic fingerprint from evidenceSnippet', () => {
    const finding1 = {
      evidenceSnippet: '  const x = 1;\n  const y = 2;  ',
      title: 'Unused variable',
      filePath: 'src/app.ts',
    };
    const finding2 = {
      evidenceSnippet: 'const x = 1;\nconst y = 2;',
      title: 'Different title',
      filePath: 'src/other.ts',
    };

    const fp1 = computeFingerprint(finding1);
    const fp2 = computeFingerprint(finding2);

    expect(fp1).toBeDefined();
    expect(fp1).toHaveLength(40); // SHA-1 hex
    expect(fp1).toBe(fp2); // Normalized snippet matches
  });

  it('should fall back to title + filePath when evidenceSnippet is missing', () => {
    const finding = {
      title: 'Missing return',
      filePath: 'src/user.service.ts',
    };

    const fp = computeFingerprint(finding);
    expect(fp).toBeDefined();
    expect(fp).toHaveLength(40);
  });

  it('should stamp fingerprints on findings array in-place', () => {
    const findings = [
      {
        id: '1',
        title: 'Issue 1',
        filePath: 'src/a.ts',
        evidenceSnippet: 'foo()',
      },
      {
        id: '2',
        title: 'Issue 2',
        filePath: 'src/b.ts',
      },
      {
        id: '3',
        title: 'Issue 3',
        filePath: 'src/c.ts',
        fingerprint: 'already-existing-fp',
      },
    ];

    const result = stampFingerprints(findings);
    expect(result[0].fingerprint).toBeDefined();
    expect(result[1].fingerprint).toBeDefined();
    expect(result[2].fingerprint).toBe('already-existing-fp');
  });
});
