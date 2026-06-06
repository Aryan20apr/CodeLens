import type { Finding } from '../../graph/state.types';
import type { GithubReviewCommentInput } from '../types/pr-findings.types';

const DEFAULT_MAX_BODY = 12_000;

function formatCommentBody(finding: Finding, maxChars: number): string {
  const parts = [`**${finding.title}**`, '', finding.description];
  if (finding.suggestedFix?.trim()) {
    parts.push('', `**Suggested fix:** ${finding.suggestedFix.trim()}`);
  }
  if (finding.evidenceSnippet?.trim()) {
    parts.push('', '```', finding.evidenceSnippet.trim(), '```');
  }
  let body = parts.join('\n');
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars - 20)}\n\n…(truncated)`;
  }
  return body;
}

/**
 * Map validated findings to GitHub inline comments (1 finding → 1 comment).
 * Multiple findings on the same line are allowed (e.g. critical + warning).
 */
export function mapFindingsToGithubComments(
  findings: Finding[],
  maxCommentBodyChars = DEFAULT_MAX_BODY,
): GithubReviewCommentInput[] {
  const comments: GithubReviewCommentInput[] = [];

  for (const f of findings) {
    if (!f.filePath) continue;

    const comment: GithubReviewCommentInput = {
      path: f.filePath,
      line: f.location.startLine,
      side: 'RIGHT',
      body: formatCommentBody(f, maxCommentBodyChars),
    };

    if (f.location.endLine > f.location.startLine) {
      comment.start_line = f.location.startLine;
      comment.start_side = 'RIGHT';
      comment.line = f.location.endLine;
    }

    comments.push(comment);
  }

  return comments;
}