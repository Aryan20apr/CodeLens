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

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function comparableText(finding: Finding): string {
  return normalizeText(
    [finding.title, finding.description, finding.evidenceSnippet]
      .filter(Boolean)
      .join(' '),
  );
}

function locationsOverlap(a: CodeLocation, b: CodeLocation): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function tokenJaccard(a: string, b: string): number {
  const tokensA = new Set(
    normalizeText(a).split(/\W+/).filter(Boolean),
  );

  const tokensB = new Set(
    normalizeText(b).split(/\W+/).filter(Boolean),
  );

  const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;

  const union = new Set([...tokensA, ...tokensB]).size;

  return union === 0 ? 1 : intersection / union;
}

function areSimilar(
  a: Finding,
  b: Finding,
  threshold: number,
): boolean {
  const pathA = a.filePath?.trim();
  const pathB = b.filePath?.trim();
  if (!pathA || !pathB || pathA !== pathB) return false;
  if (!locationsOverlap(a.location, b.location)) return false;

  const textA = comparableText(a);
  const textB = comparableText(b);
  if (!textA || !textB) return false;

  return tokenJaccard(textA, textB) >= threshold;
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

function buildClusters(
  findings: Finding[],
  threshold: number,
): Finding[][] {
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

  const clusters = buildClusters(withPath, options.similarityThreshold);
  const merged = clusters.map(mergeCluster);

  return [...merged, ...withoutPath];
}
