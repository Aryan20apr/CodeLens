import type { FileIndexEntry, ReviewChunk } from '../../diff/types/review-chunk.types';

/**
 * The LLM returns filePath + location.startLine, but those can be wrong. Before posting inline comments, the validator must deterministically check:

line_not_in_diff — Is that line actually an added line in the diff?
→ linesByFile.get(filePath)?.has(startLine)

cross_file_unsupported — Is the finding on a file outside the diff?
→ If filePath ∉ diffFilePaths, it must be in hintedFilePaths
 */


export type AddedLineIndex = {
    linesByFile: Map<string, Set<number>>;
    diffFilePaths: Set<string>;
    hintedFilePaths: Set<string>;
  };

  export function buildAddedLineIndex(
    chunks: ReviewChunk[],
    fileIndex: FileIndexEntry[],
    hintedPaths: string[],
  ): AddedLineIndex {
    const linesByFile = new Map<string, Set<number>>();
    const diffFilePaths = new Set<string>();
  
    for (const chunk of chunks) {
      diffFilePaths.add(chunk.filePath);
      let lines = linesByFile.get(chunk.filePath);
      if (!lines) {
        lines = new Set<number>();
        linesByFile.set(chunk.filePath, lines);
      }
      for (const added of chunk.addedLines) {
        lines.add(added.line);
      }
    }
  
    for (const entry of fileIndex) {
      diffFilePaths.add(entry.path);
    }
  
    const hintedFilePaths = new Set(hintedPaths);
  
    return { linesByFile, diffFilePaths, hintedFilePaths };
  }