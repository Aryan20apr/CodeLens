export type CrossFileHintKind = 'symbol_usage' | 'import_target';

export type CrossFileHintSnippet = {
    path: string;
    line: number | null;
    text: string;
}

export type CrossFileHint = {
    kind: CrossFileHintKind;
    query: string;
    symbol?: string;
    modulePath?: string;
    paths: string[];
    snippets: CrossFileHintSnippet[];
    fetchedAt: string; // ISO
  };