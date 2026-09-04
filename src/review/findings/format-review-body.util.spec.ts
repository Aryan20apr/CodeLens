import type { Finding } from '../../graph/state.types';
import {
  formatStructuredOverview,
  formatReviewBody,
} from './format-review-body.util';

describe('format-review-body.util', () => {
  const findings: Finding[] = [
    {
      id: 'f1',
      filePath: 'src/auth/jwt.ts',
      location: { startLine: 42, endLine: 45 },
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded secret',
      description: 'Secret is hardcoded in JWT provider',
      confidence: 'high',
    },
    {
      id: 'f2',
      filePath: 'src/user/user.service.ts',
      location: { startLine: 10, endLine: 12 },
      category: 'correctness',
      severity: 'warning',
      title: 'Missing null check',
      description: 'user might be null',
      confidence: 'medium',
    },
  ];

  it('should format structured overview with key findings', () => {
    const output = formatStructuredOverview(
      'This PR introduces auth updates.',
      findings,
      2,
    );

    expect(output).toContain('## Overview');
    expect(output).toContain('This PR introduces auth updates.');
    expect(output).toContain('## Key Findings');
    expect(output).toContain('🔴 `src/auth/jwt.ts:42` **Hardcoded secret**');
    expect(output).toContain('🟡 `src/user/user.service.ts:10` **Missing null check**');
    expect(output).toContain('2 inline review comments on this PR.');
  });

  it('should format overview without findings when findings list is empty', () => {
    const output = formatStructuredOverview('Clean PR with no issues.', [], 0);

    expect(output).toContain('## Overview');
    expect(output).toContain('Clean PR with no issues.');
    expect(output).not.toContain('## Key Findings');
    expect(output).not.toContain('inline review comment');
  });

  it('legacy formatReviewBody should format properly', () => {
    const output = formatReviewBody('Simple overview text', 1);
    expect(output).toContain('## Overview');
    expect(output).toContain('Simple overview text');
    expect(output).toContain('1 inline review comment on this PR.');
  });
});
