import { createHash } from 'node:crypto';

import type { Finding } from '../../graph/state.types';

function normalizeFingerprintPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildFindingFingerprint(finding: Finding): string | null {
  if (!finding.filePath?.trim()) return null;

  const payload = [
    normalizeFingerprintPart(finding.filePath),
    finding.category,
    normalizeFingerprintPart(finding.title),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}
