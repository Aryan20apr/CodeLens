import { createHash } from 'crypto';

/** Normalize a string for fingerprinting: trim, lowercase, collapse whitespace. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Return a SHA-1 hex fingerprint for a finding, derived from evidenceSnippet
 *  when available, otherwise from title + filePath. */
export function computeFingerprint(finding: {
  evidenceSnippet?: string;
  title: string;
  filePath?: string;
}): string {
  const source = finding.evidenceSnippet?.trim()
    ? normalize(finding.evidenceSnippet)
    : normalize(`${finding.title}::${finding.filePath ?? ''}`);
  return createHash('sha1').update(source).digest('hex');
}

/** Stamp fingerprints on every finding in-place and return the array. */
export function stampFingerprints<
  T extends {
    evidenceSnippet?: string;
    title: string;
    filePath?: string;
    fingerprint?: string;
  },
>(findings: T[]): T[] {
  for (const f of findings) {
    if (!f.fingerprint) {
      f.fingerprint = computeFingerprint(f);
    }
  }
  return findings;
}
