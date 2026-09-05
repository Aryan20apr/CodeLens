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

/**
 * Two-pass match: fingerprint first (resilient to line shifts), key fallback.
 *
 * prevByFingerprint is multi-valued: if two previous findings share a fingerprint
 * (collision), each current finding consumes exactly one previous finding from the
 * bucket (FIFO) so that `unchangedFindings` is counted correctly.
 */
export function classifyDelta(
  current: Finding[],
  previous: Finding[],
): DeltaResult {
  // Multi-valued map: fingerprint -> all previous findings with that fingerprint
  const prevByFingerprint = new Map<string, Finding[]>();
  for (const f of previous) {
    if (f.fingerprint) {
      const bucket = prevByFingerprint.get(f.fingerprint) ?? [];
      bucket.push(f);
      prevByFingerprint.set(f.fingerprint, bucket);
    }
  }

  const prevByKey = new Map(
    previous.map((f) => [`${f.filePath}:${f.location.startLine}:${f.category}`, f]),
  );

  // Tracks how many times each fingerprint bucket has been consumed by current findings.
  // Each current finding consumes at most one previous finding from the bucket (FIFO).
  const fpConsumedCount = new Map<string, number>();

  const newFindings: Finding[] = [];
  const unchangedFindings: Finding[] = [];

  for (const f of current) {
    const byFpCandidates = f.fingerprint
      ? (prevByFingerprint.get(f.fingerprint) ?? [])
      : [];
    const byKey = prevByKey.get(`${f.filePath}:${f.location.startLine}:${f.category}`);

    if (byFpCandidates.length > 0) {
      // Consume one previous finding from the bucket (FIFO) so that two current
      // findings with the same fingerprint don't both claim "unchanged" against
      // the same single previous finding.
      const consumed = fpConsumedCount.get(f.fingerprint!) ?? 0;
      if (byFpCandidates[consumed]) {
        fpConsumedCount.set(f.fingerprint!, consumed + 1);
      }
      unchangedFindings.push(f);
    } else if (byKey) {
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
