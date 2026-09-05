import type { Finding } from '../../graph/state.types';
import {
  classifyDelta,
  buildIncrementalSummary,
} from './incremental-summary.util';

describe('incremental-summary.util', () => {
  const previousFindings: Finding[] = [
    {
      id: 'f1',
      filePath: 'src/auth/jwt.ts',
      location: { startLine: 42, endLine: 45 },
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded secret',
      description: 'Secret is hardcoded',
      confidence: 'high',
      fingerprint: 'fp-secret-123',
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
      fingerprint: 'fp-null-check-456',
    },
  ];

  describe('classifyDelta', () => {
    it('should identify unchanged findings by fingerprint even when line shifts', () => {
      const currentFindings: Finding[] = [
        {
          id: 'f1-new',
          filePath: 'src/auth/jwt.ts',
          location: { startLine: 52, endLine: 55 }, // Line shifted from 42 to 52
          category: 'security',
          severity: 'critical',
          title: 'Hardcoded secret',
          description: 'Secret is hardcoded',
          confidence: 'high',
          fingerprint: 'fp-secret-123', // Same fingerprint
        },
      ];

      const { newFindings, resolvedFindings, unchangedFindings } =
        classifyDelta(currentFindings, previousFindings);

      expect(unchangedFindings).toHaveLength(1);
      expect(unchangedFindings[0].id).toBe('f1-new');
      expect(resolvedFindings).toHaveLength(1);
      expect(resolvedFindings[0].id).toBe('f2'); // f2 was resolved
      expect(newFindings).toHaveLength(0);
    });

    it('should identify new findings and resolved findings', () => {
      const currentFindings: Finding[] = [
        {
          id: 'f3',
          filePath: 'src/payment/stripe.ts',
          location: { startLine: 20, endLine: 22 },
          category: 'performance',
          severity: 'info',
          title: 'Unindexed query',
          description: 'Missing index on accountId',
          confidence: 'high',
          fingerprint: 'fp-unindexed-789',
        },
      ];

      const { newFindings, resolvedFindings, unchangedFindings } =
        classifyDelta(currentFindings, previousFindings);

      expect(newFindings).toHaveLength(1);
      expect(newFindings[0].id).toBe('f3');
      expect(resolvedFindings).toHaveLength(2); // f1 and f2 both resolved
      expect(unchangedFindings).toHaveLength(0);
    });
  });

  describe('buildIncrementalSummary', () => {
    it('should format incremental summary markdown correctly', () => {
      const currentFindings: Finding[] = [
        {
          id: 'f3',
          filePath: 'src/payment/stripe.ts',
          location: { startLine: 20, endLine: 22 },
          category: 'performance',
          severity: 'info',
          title: 'Unindexed query',
          description: 'Missing index',
          confidence: 'high',
        },
      ];

      const summary = buildIncrementalSummary(
        currentFindings,
        'def4567890',
        {
          headSha: 'abc1234567',
          baseSha: 'base000000',
          findings: previousFindings,
        },
        1,
      );

      expect(summary).toContain('## What Changed Since Last Review');
      expect(summary).toContain('`abc1234`');
      expect(summary).toContain('`def4567`');
      expect(summary).toContain('### New Findings (1)');
      expect(summary).toContain('Unindexed query');
      expect(summary).not.toContain('### Resolved / No Longer in Diff');
      expect(summary).toContain('1 inline review comment on this PR.');
    });
  });
});
