import type {
  CodeLocation,
  Finding,
  FindingCategory,
  FindingSeverity,
} from '../../graph/state.types';

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const CONFIDENCE_RANK: Record<Finding['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const CATEGORY_RANK: Record<FindingCategory, number> = {
  security: 5,
  correctness: 4,
  performance: 3,
  best_practices: 2,
  maintainability: 1,
};

export type FindingDedupOptions = {
  similarityThreshold: number;
};

function normalizeCodeAnchorKey(snippet: string): string {
  // Strip non-alphanumeric punctuation and collapse whitespace so that variations like
  // '.antMatchers' vs 'antMatchers' or '+ methodCall()' produce the exact same key.
  return snippet
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWordTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(Boolean));
}

function locationsOverlap(a: CodeLocation, b: CodeLocation): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function setJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function isTokenSubset(
  a: Set<string>,
  b: Set<string>,
  minRatio = 0.75,
): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let inCommon = 0;
  for (const token of smaller) {
    if (larger.has(token)) inCommon++;
  }
  return inCommon / smaller.size >= minRatio;
}

function areSimilar(a: Finding, b: Finding, threshold: number): boolean {
  const pathA = a.filePath?.trim();
  const pathB = b.filePath?.trim();
  if (!pathA || !pathB || pathA !== pathB) return false;
  if (!locationsOverlap(a.location, b.location)) return false;

  // Signal 1: High code snippet similarity or subset match on overlapping lines
  const snipA = a.evidenceSnippet ? extractWordTokens(a.evidenceSnippet) : null;
  const snipB = b.evidenceSnippet ? extractWordTokens(b.evidenceSnippet) : null;
  if (snipA && snipB && snipA.size > 0 && snipB.size > 0) {
    if (setJaccard(snipA, snipB) >= 0.5 || isTokenSubset(snipA, snipB, 0.75)) {
      return true;
    }
  }

  // Signal 2: Title similarity on overlapping lines (concise summary match)
  const titleA = extractWordTokens(a.title);
  const titleB = extractWordTokens(b.title);
  if (setJaccard(titleA, titleB) >= 0.35) {
    return true;
  }

  // Signal 3: Exact same line range with moderate topic overlap
  const sameExactLines =
    a.location.startLine === b.location.startLine &&
    a.location.endLine === b.location.endLine;

  const allA = extractWordTokens(
    `${a.title} ${a.description} ${a.evidenceSnippet ?? ''}`,
  );
  const allB = extractWordTokens(
    `${b.title} ${b.description} ${b.evidenceSnippet ?? ''}`,
  );

  if (sameExactLines && setJaccard(allA, allB) >= 0.2) {
    return true;
  }

  // Signal 4: General text overlap threshold
  return setJaccard(allA, allB) >= threshold;
}

class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = Array(size).fill(0);
  }

  find(i: number): number {
    if (this.parent[i] !== i) {
      this.parent[i] = this.find(this.parent[i]); // Path compression
    }
    return this.parent[i];
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);

    if (rootI === rootJ) {
      return;
    }

    if (this.rank[rootI] < this.rank[rootJ]) {
      this.parent[rootI] = rootJ;
    } else if (this.rank[rootI] > this.rank[rootJ]) {
      this.parent[rootJ] = rootI;
    } else {
      this.parent[rootJ] = rootI;
      this.rank[rootI]++;
    }
  }
}

/**
 * Pre-pass: group findings by (filePath, normalizedEvidenceSnippet).
 * Findings that reference the exact same code block are unconditionally merged,
 * regardless of category. Picks canonical via compareCanonical.
 * Findings without an evidenceSnippet pass through unchanged.
 */
function deduplicateByCodeAnchor(findings: Finding[]): Finding[] {
  const buckets = new Map<string, Finding[]>();
  const noAnchor: Finding[] = [];

  for (const f of findings) {
    const snippet = f.evidenceSnippet?.trim();
    if (!snippet) {
      noAnchor.push(f);
      continue;
    }
    const key = `${f.filePath!.trim()}::${normalizeCodeAnchorKey(snippet)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(f);
    buckets.set(key, bucket);
  }

  const merged: Finding[] = [];
  for (const bucket of buckets.values()) {
    merged.push(mergeCluster(bucket));
  }

  return [...merged, ...noAnchor];
}

function buildClusters(findings: Finding[], threshold: number): Finding[][] {
  if (findings.length === 0) return [];

  const uf = new UnionFind(findings.length);
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      if (areSimilar(findings[i], findings[j], threshold)) {
        uf.union(i, j);
      }
    }
  }

  const clusters = new Map<number, Finding[]>();
  for (let i = 0; i < findings.length; i++) {
    const root = uf.find(i);
    const cluster = clusters.get(root) ?? [];
    cluster.push(findings[i]);
    clusters.set(root, cluster);
  }

  return [...clusters.values()];
}

function locationSpan(location: CodeLocation): number {
  return location.endLine - location.startLine;
}

function compareCanonical(a: Finding, b: Finding): number {
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;

  const conf = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  if (conf !== 0) return conf;

  const cat = CATEGORY_RANK[b.category] - CATEGORY_RANK[a.category];
  if (cat !== 0) return cat;

  return locationSpan(a.location) - locationSpan(b.location);
}

function mergeLocation(cluster: Finding[]): CodeLocation {
  const startLine = Math.max(...cluster.map((f) => f.location.startLine));
  const endLine = Math.min(...cluster.map((f) => f.location.endLine));

  if (startLine <= endLine) {
    return { startLine, endLine };
  }

  return { ...pickCanonical(cluster).location };
}

function pickCanonical(cluster: Finding[]): Finding {
  return cluster.reduce((best, current) =>
    compareCanonical(best, current) > 0 ? current : best,
  );
}

function mergeCluster(cluster: Finding[]): Finding {
  const canonical = pickCanonical(cluster);
  if (cluster.length === 1) return canonical;

  return {
    ...canonical,
    location: mergeLocation(cluster),
  };
}

export function clusterAndMergeFindings(
  findings: Finding[],
  options: FindingDedupOptions,
): Finding[] {
  const withPath = findings.filter((f) => f.filePath?.trim());
  const withoutPath = findings.filter((f) => !f.filePath?.trim());

  // Pre-pass: deterministic code-anchor dedup (same snippet = same issue, any category)
  const afterAnchor = deduplicateByCodeAnchor(withPath);

  // Jaccard cluster pass: handles same-location, different-snippet-window findings
  const clusters = buildClusters(afterAnchor, options.similarityThreshold);
  const merged = clusters.map(mergeCluster);

  return [...merged, ...withoutPath];
}
