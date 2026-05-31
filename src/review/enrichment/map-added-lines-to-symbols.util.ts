import type { CodeSymbol } from '../../graph/state.types';
import type { AddedLineSymbolRef } from './pr-file-enrichment.types';

/** Innermost symbol wins (smallest line span). Prefer function over class at equal span. */
export function mapAddedLinesToSymbols(
  addedLines: number[],
  functions: CodeSymbol[],
  classes: CodeSymbol[],
): AddedLineSymbolRef[] {
  const symbols = [
    ...functions.map((s) => ({ ...s, kind: 'function' as const })),
    ...classes.map((s) => ({ ...s, kind: 'class' as const })),
  ];

  return addedLines.map((line) => {
    const containing = symbols.filter(
      (s) => s.startLine <= line && line <= s.endLine,
    );
    if (containing.length === 0) {
      return { line, symbolKind: null, symbolName: null };
    }
    containing.sort((a, b) => {
      const spanA = a.endLine - a.startLine;
      const spanB = b.endLine - b.startLine;
      if (spanA !== spanB) return spanA - spanB;
      if (a.kind !== b.kind) return a.kind === 'function' ? -1 : 1;
      return 0;
    });
    const best = containing[0];
    return { line, symbolKind: best.kind, symbolName: best.name };
  });
}
