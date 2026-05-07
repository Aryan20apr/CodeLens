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
  
  export type CodeMetadata = {
    linesOfCode: number;
    functionCount: number;
    classCount: number;
    importCount: number;
    imports: string[];
    entryPoints: string[];
    maxCyclomaticComplexity: number;
    averageCyclomaticComplexity: number;
  };
  
  export type ParseStatus = 'pending' | 'parsing' | 'complete' | 'failed';