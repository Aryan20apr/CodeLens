import type { Finding } from '../../graph/state.types';

export type PreviousReviewContext = {
  headSha: string;
  baseSha: string;
  findings: Finding[];
};

export type DeltaResult = {
  newFindings: Finding[];
  unchangedFindings: Finding[];
};

/** Two-pass match: fingerprint first (resilient to line shifts), key fallback. */
export function classifyDelta(
  current: Finding[],
  previous: Finding[],
): DeltaResult {
  const prevByFingerprint = new Map(
    previous.filter((f) => f.fingerprint).map((f) => [f.fingerprint!, f]),
  );
  const prevByKey = new Map(
    previous.map((f) => [`${f.filePath}:${f.location.startLine}:${f.category}`, f]),
  );

  const newFindings: Finding[] = [];
  const unchangedFindings: Finding[] = [];

  for (const f of current) {
    const byFp = f.fingerprint ? prevByFingerprint.get(f.fingerprint) : undefined;
    const byKey = prevByKey.get(`${f.filePath}:${f.location.startLine}:${f.category}`);
    const matched = byFp ?? byKey;

    if (matched) {
      unchangedFindings.push(f);
    } else {
      newFindings.push(f);
    }
  }

  return { newFindings, unchangedFindings };
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
};

function formatFindingLine(f: Finding): string {
  const emoji = SEVERITY_EMOJI[f.severity] ?? '•';
  const loc = f.filePath ? `\`${f.filePath}:${f.location.startLine}\`` : '';
  return `- ${emoji} ${loc} — ${f.title} *(${f.category} · ${f.severity})*`;
}

/** Render the incremental markdown body for the GitHub review. */
export function buildIncrementalSummary(
  current: Finding[],
  headSha: string,
  previous: PreviousReviewContext,
  inlineCommentCount: number,
): string {
  const { newFindings, unchangedFindings } = classifyDelta(
    current,
    previous.findings,
  );

  const currentHeadSha = headSha ? headSha.slice(0, 7) : 'prev';
  const previousHeadSha = previous.headSha ? previous.headSha.slice(0, 7) : 'head';

  const sections: string[] = [
    `## What Changed Since Last Review`,
    `**Previous head:** \`${previousHeadSha}\` → **Current head:** \`${currentHeadSha}\``,
    '',
  ];

  if (newFindings.length > 0) {
    sections.push(`### New Findings (${newFindings.length})`);
    sections.push(...newFindings.map(formatFindingLine));
    sections.push('');
  } else {
    sections.push('### New Findings (0)', '_No new findings._', '');
  }

  if (unchangedFindings.length > 0) {
    sections.push(
      `### Unchanged Findings Still Present (${unchangedFindings.length})`,
      `_${unchangedFindings.length} finding${unchangedFindings.length === 1 ? '' : 's'} from the previous review remain in scope. See inline comments._`,
      '',
    );
  }

  if (inlineCommentCount > 0) {
    const noun = inlineCommentCount === 1 ? 'comment' : 'comments';
    sections.push('---', `${inlineCommentCount} inline review ${noun} on this PR.`);
  }

  return sections.join('\n');
}
