/**
 * Inital Graph state types for the snippet path
 * Add`source: "pr"`, diff chunks, rules, memory — not included here.
 */
export type SnippetSource = {
    type: 'snippet';
    language: string;
    code: string;
    filename?: string;
  };
  
  export type CodeSymbol = {
    name: string;
    startLine: number;
    endLine: number;
  };
  
  export type CodeMetadata = {
    // always available
    linesOfCode: number;
  
    // extracted via Tree-sitter queries (language agnostic)
    functions: CodeSymbol[];
    classes: CodeSymbol[];
    imports: string[];
    entryPoints: string[];
  
    functionCount: number;
    classCount: number;
    importCount: number;
  
    /**
     * Complexity is optional in Tree-sitter mode.
     * Set to 0 (or null) until you implement a language-specific / generic approximation.
     */
    maxCyclomaticComplexity: number | null;
    averageCyclomaticComplexity: number | null;
  };
  
  export type ParseStatus = 'pending' | 'parsing' | 'complete' | 'failed';