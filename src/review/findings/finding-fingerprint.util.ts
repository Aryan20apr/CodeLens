import { createHash } from 'crypto';

/** Normalize a string for fingerprinting: trim, lowercase, collapse whitespace. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Return a SHA-1 hex fingerprint for a finding.
 *
 * Hash source: `normalize(filePath) + "::" + category + "::" + body`
 *   where body = normalize(evidenceSnippet) when present, else normalize(title).
 *
 * Including filePath and category prevents cross-file and cross-category
 * collisions when different agents encounter identical code snippets in
 * different contexts. The fingerprint remains resilient to line-number
 * shifts because no position data is included.
 */
export function computeFingerprint(finding: {
  evidenceSnippet?: string;
  title: string;
  filePath?: string;
  category?: string;
}): string {
  const file = normalize(finding.filePath ?? '');
  const cat = finding.category ?? '';
  const body = finding.evidenceSnippet?.trim()
    ? normalize(finding.evidenceSnippet)
    : normalize(finding.title);

  return createHash('sha1').update(`${file}::${cat}::${body}`).digest('hex');
}

/**
 * Stamp fingerprints on every finding in-place and return the array.
 * Skips findings that already have a fingerprint set.
 */
export function stampFingerprints<
  T extends {
    evidenceSnippet?: string;
    title: string;
    filePath?: string;
    category?: string;
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
