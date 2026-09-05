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
});
