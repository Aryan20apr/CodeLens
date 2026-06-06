export function formatReviewBody(
    analysisSummary: string,
    inlineCommentCount: number,
  ): string {
    const overview = analysisSummary.trim();
    const sections = ['## Overview', overview];
  
    if (inlineCommentCount > 0) {
      const noun = inlineCommentCount === 1 ? 'comment' : 'comments';
      sections.push(
        '',
        `---`,
        `${inlineCommentCount} inline review ${noun} on this PR.`,
      );
    }
  
    return sections.join('\n');
  }