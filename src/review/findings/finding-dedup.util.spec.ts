import { clusterAndMergeFindings } from './finding-dedup.util';
import type { Finding } from '../../graph/state.types';

describe('clusterAndMergeFindings', () => {
  const makeFinding = (overrides: Partial<Finding>): Finding => ({
    id: 'finding-1',
    title: 'Default title',
    description: 'Default description',
    filePath: 'src/app.ts',
    location: { startLine: 10, endLine: 20 },
    severity: 'warning',
    confidence: 'medium',
    category: 'correctness',
    ...overrides,
  });

  it('preserves single findings', () => {
    const finding = makeFinding({ title: 'Unique bug' });
    const result = clusterAndMergeFindings([finding], { similarityThreshold: 0.4 });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Unique bug');
  });

  it('merges overlapping findings with high textual similarity', () => {
    const finding1 = makeFinding({
      title: 'Potential SQL injection',
      description: 'Raw query constructed directly from user input without parametrization',
      severity: 'warning',
      location: { startLine: 10, endLine: 25 },
    });
    const finding2 = makeFinding({
      title: 'SQL injection vulnerability',
      description: 'Raw query constructed directly from user input without parametrization',
      severity: 'critical', // higher severity should win
      location: { startLine: 12, endLine: 20 },
    });

    const result = clusterAndMergeFindings([finding1, finding2], { similarityThreshold: 0.4 });
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('critical');
    expect(result[0].location).toEqual({ startLine: 12, endLine: 20 });
  });

  it('keeps findings separate if locations do not overlap', () => {
    const finding1 = makeFinding({
      title: 'Missing null check',
      description: 'Object might be undefined',
      location: { startLine: 5, endLine: 10 },
    });
    const finding2 = makeFinding({
      title: 'Missing null check',
      description: 'Object might be undefined',
      location: { startLine: 50, endLine: 60 },
    });

    const result = clusterAndMergeFindings([finding1, finding2], { similarityThreshold: 0.4 });
    expect(result).toHaveLength(2);
  });

  it('keeps findings separate if files differ', () => {
    const finding1 = makeFinding({
      filePath: 'src/a.ts',
      title: 'Identical bug',
      location: { startLine: 10, endLine: 20 },
    });
    const finding2 = makeFinding({
      filePath: 'src/b.ts',
      title: 'Identical bug',
      location: { startLine: 10, endLine: 20 },
    });

    const result = clusterAndMergeFindings([finding1, finding2], { similarityThreshold: 0.4 });
    expect(result).toHaveLength(2);
  });

  // ─── Code-anchor pre-pass tests ─────────────────────────────────────────────

  describe('code-anchor dedup pre-pass', () => {
    it('merges cross-category findings with identical evidenceSnippet in the same file', () => {
      // Simulates: security agent + best_practices agent both flagging the same code line
      const securityFinding = makeFinding({
        id: 'f-security',
        category: 'security',
        severity: 'critical',
        title: 'All GET Requests Permitted Without Authentication',
        description: 'SecurityConfig line 79-80 adds .antMatchers(HttpMethod.GET).permitAll() which allows unauthenticated access to ALL GET endpoints.',
        evidenceSnippet: '.antMatchers(HttpMethod.GET)\n .permitAll()',
        filePath: 'src/SecurityConfig.java',
        location: { startLine: 79, endLine: 80 },
      });
      const correctnessFinding = makeFinding({
        id: 'f-correctness',
        category: 'correctness',
        severity: 'critical',
        title: 'All GET endpoints publicly accessible without authentication',
        description: 'The security configuration permits all GET requests unconditionally bypassing JWT authentication for every GET endpoint.',
        evidenceSnippet: '.antMatchers(HttpMethod.GET)\n .permitAll()', // same snippet (whitespace may vary)
        filePath: 'src/SecurityConfig.java',
        location: { startLine: 79, endLine: 80 },
      });

      const result = clusterAndMergeFindings(
        [securityFinding, correctnessFinding],
        { similarityThreshold: 0.4 },
      );

      expect(result).toHaveLength(1);
      // security outranks correctness in CATEGORY_RANK — canonical should be the security finding
      expect(result[0].category).toBe('security');
      expect(result[0].severity).toBe('critical');
    });

    it('merges findings where evidenceSnippet differs only in whitespace', () => {
      const f1 = makeFinding({
        id: 'f1',
        category: 'security',
        evidenceSnippet: ' .antMatchers(HttpMethod.GET)\n                 .permitAll()',
        filePath: 'src/SecurityConfig.java',
        location: { startLine: 79, endLine: 80 },
      });
      const f2 = makeFinding({
        id: 'f2',
        category: 'maintainability',
        evidenceSnippet: '.antMatchers(HttpMethod.GET)\n .permitAll()',
        filePath: 'src/SecurityConfig.java',
        location: { startLine: 79, endLine: 80 },
      });

      const result = clusterAndMergeFindings([f1, f2], { similarityThreshold: 0.4 });
      expect(result).toHaveLength(1);
    });

    it('does NOT merge findings with same snippet in different files', () => {
      const f1 = makeFinding({
        id: 'f1',
        category: 'security',
        evidenceSnippet: 'permitAll()',
        filePath: 'src/SecurityConfig.java',
      });
      const f2 = makeFinding({
        id: 'f2',
        category: 'correctness',
        evidenceSnippet: 'permitAll()',
        filePath: 'src/OtherConfig.java',
      });

      const result = clusterAndMergeFindings([f1, f2], { similarityThreshold: 0.4 });
      expect(result).toHaveLength(2);
    });

    it('passes findings without evidenceSnippet through to Jaccard phase', () => {
      const f1 = makeFinding({
        id: 'f1',
        title: 'Missing null check',
        description: 'Object might be null',
        evidenceSnippet: undefined,
        location: { startLine: 10, endLine: 15 },
      });
      const f2 = makeFinding({
        id: 'f2',
        title: 'Null dereference',
        description: 'Object might be null',
        evidenceSnippet: undefined,
        location: { startLine: 10, endLine: 15 },
      });

      // High similarity via Jaccard on title+description should still merge these
      const result = clusterAndMergeFindings([f1, f2], { similarityThreshold: 0.4 });
      expect(result).toHaveLength(1);
    });

    it('selects canonical by severity when merging via code-anchor', () => {
      const low = makeFinding({
        id: 'low',
        severity: 'info',
        category: 'maintainability',
        evidenceSnippet: 'springfox-boot-starter',
        filePath: 'pom.xml',
      });
      const high = makeFinding({
        id: 'high',
        severity: 'warning',
        category: 'security',
        evidenceSnippet: 'springfox-boot-starter',
        filePath: 'pom.xml',
      });

      const result = clusterAndMergeFindings([low, high], { similarityThreshold: 0.4 });
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('warning');
      expect(result[0].category).toBe('security');
    });
  });
});

