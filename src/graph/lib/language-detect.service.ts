import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import path from 'path';
import type { Logger } from 'winston';

const extMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
  };

@Injectable()
export class LanguageDetectService {
  private readonly logger: Logger;

  constructor(@Inject(WINSTON_MODULE_PROVIDER) logger: Logger) {
    this.logger = logger.child({ context: LanguageDetectService.name });
  }

  /**
   * Returns normalized language id. `hint` is non-empty when user/IDE sets language explicitly.
   */
  detectLangauge(code: string, filename?: string, hint?: string): string {
    const trimmedHint = (hint ?? '').trim();
    if (trimmedHint) {
      return this.normalizeHint(trimmedHint);
    }

    const fromName = this.fromFilename(filename);
    if (fromName) {
      return fromName;
    }
    return this.fromContentHeuristics(code);
  }

  private normalizeHint(hint: string): string {
    const h = hint.toLowerCase();
    if (h === 'ts' || h === 'typescript') {
      return 'typescript';
    }
    if (h === 'js' || h === 'javascript' || h === 'mjs' || h === 'cjs') {
      return 'javascript';
    }
    if (h === 'py' || h === 'python') {
      return 'python';
    }
    if (h === 'golang' || h === 'go') {
      return 'go';
    }
    if (h === 'rust' || h === 'rs') {
      return 'rust';
    }
    return hint;
  }

  private fromFilename(filename?: string): string | null {
    if (!filename) {
      return null;
    }
    const lower = filename.toLowerCase();
    const ext = path.extname(lower);
    return extMap[ext] ?? null;
  }

  private fromContentHeuristics(code: string): string {
    const head = code.slice(0, 2000);
    if (/^\s*#!.*python/.test(head) || /^\s*#.*python/.test(head)) {
      return 'python';
    }
    if (head.includes('def ') && /:\s*$/m.test(code.slice(0, 5000))) {
      // Very weak: avoid classifying C as python — require `def foo():` style
      if (/\bdef\s+\w+\s*\(/m.test(head) && /:\s*$/m.test(code.slice(0, 2000))) {
        return 'python';
      }
    }
    if (/\bpackage\s+main\b/m.test(head) && /\bimport\s+"[^"]+"\b/m.test(head)) {
      return 'go';
    }
    if (/\b(fn|let mut|const)\b/.test(head) && head.includes('use ')) {
      return 'rust';
    }
    if (/\b(public\s+class|import\s+java\.)/m.test(head)) {
      return 'java';
    }
    // TypeScript / JavaScript: prefer TS if explicit `type` / `interface` or `as const` etc.
    if (/\b(interface|type\s+\w|as\s+const|satisfies\s+\w|enum\s+\w|namespace\s+\w)\b/m.test(code)) {
      return 'typescript';
    }
    if (/\b(import|export)\b/.test(head) || /require\(/m.test(head) || /module\.exports/m.test(head)) {
      return 'javascript';
    }
    return 'unknown';
  }
}
