import type { Finding, FindingSeverity } from '../../graph/state.types';

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const SEVERITY_EMOJI: Record<FindingSeverity, string> = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
};

/** Structured first-review body for the simple (single-agent) or synthesized path. */
export function formatStructuredOverview(
  analysisSummary: string,
  findings: Finding[],
  inlineCommentCount: number,
): string {
  const trimmed = analysisSummary.trim();
  const sections: string[] = [];

  if (trimmed.startsWith('#')) {
    sections.push(trimmed);
  } else {
    sections.push('## Overview', trimmed, '');

    // Key Findings — top 7 by severity (for simple single-agent path)
    const topFindings = [...findings]
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
      .slice(0, 7);

    if (topFindings.length > 0) {
      sections.push('## Key Findings');
      for (const f of topFindings) {
        const emoji = SEVERITY_EMOJI[f.severity] ?? '•';
        const loc = f.filePath ? ` \`${f.filePath}:${f.location.startLine}\`` : '';
        sections.push(`- ${emoji}${loc} **${f.title}** — ${f.description}`);
      }
      sections.push('');
    }
  }

  if (inlineCommentCount > 0) {
    const noun = inlineCommentCount === 1 ? 'comment' : 'comments';
    sections.push('---', `${inlineCommentCount} inline review ${noun} on this PR.`);
  }

  return sections.join('\n');
}

/** Legacy shim */
export function formatReviewBody(
  analysisSummary: string,
  inlineCommentCount: number,
): string {
  return formatStructuredOverview(analysisSummary, [], inlineCommentCount);
}