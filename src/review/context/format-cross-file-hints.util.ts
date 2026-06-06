import type { CrossFileHint } from '../types/cross-file-hint.types';

export function formatHintForToolMessage(hint: CrossFileHint): string {
  if (hint.paths.length === 0) {
    return `No matches for query: ${hint.query}`;
  }

  const lines: string[] = [
    `Query: ${hint.query}`,
    `Paths (${hint.paths.length}): ${hint.paths.join(', ')}`,
  ];

  for (const snippet of hint.snippets.slice(0, 8)) {
    const loc = snippet.line != null ? `:${snippet.line}` : '';
    lines.push(`- \`${snippet.path}${loc}\`: ${snippet.text.trim()}`);
  }

  return lines.join('\n');
}

export function formatCrossFileHintsForPrompt(hints: CrossFileHint[]): string {
  if (hints.length === 0) {
    return '(no cross-file search results)';
  }

  return hints
    .map((hint, index) => {
      const header =
        hint.kind === 'symbol_usage'
          ? `### Search ${index + 1}: symbol \`${hint.symbol ?? 'unknown'}\``
          : `### Search ${index + 1}: import \`${hint.modulePath ?? 'unknown'}\``;
      return `${header}\n${formatHintForToolMessage(hint)}`;
    })
    .join('\n\n');
}
