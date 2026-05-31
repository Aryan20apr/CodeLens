import type { PrFileContext } from './pr-file-enrichment.types';

export function formatFileContextsForPrompt(contexts: PrFileContext[]): string {
  if (contexts.length === 0) {
    return '(no structural context; review diff chunks only)';
  }

  const blocks = contexts.map((ctx) => {
    if (ctx.fetchStatus !== 'ok' || !ctx.metadata) {
      return `### ${ctx.filePath}\n- status: ${ctx.fetchStatus}${ctx.skipReason ? ` (${ctx.skipReason})` : ''}`;
    }
    const m = ctx.metadata;
    const symbolLines = ctx.addedLineSymbols
      .filter((r) => r.symbolName)
      .map((r) => `  - L${r.line}: ${r.symbolKind} \`${r.symbolName}\``)
      .join('\n');

    return [
      `### ${ctx.filePath}`,
      `- language: ${ctx.language}`,
      `- loc: ${m.linesOfCode}, functions: ${m.functionCount}, classes: ${m.classCount}, imports: ${m.importCount}`,
      m.imports.length
        ? `- imports (sample): ${m.imports.slice(0, 12).join(', ')}`
        : '',
      symbolLines ? `- changed lines in symbols:\n${symbolLines}` : '',
      m.functions.length
        ? `- functions (sample): ${m.functions
            .slice(0, 8)
            .map((f) => `${f.name}@${f.startLine}-${f.endLine}`)
            .join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return blocks.join('\n\n');
}
