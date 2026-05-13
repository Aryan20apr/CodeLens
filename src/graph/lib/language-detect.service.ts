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
  private static readonly CLASS = LanguageDetectService.name;

  constructor(@Inject(WINSTON_MODULE_PROVIDER) logger: Logger) {
    this.logger = logger.child({ context: LanguageDetectService.name });
  }

  /**
   * Returns normalized language id. `hint` is non-empty when user/IDE sets language explicitly.
   */
  detectLanguage(code: string, filename?: string, hint?: string): string {
    const METHOD = 'detectLanguage';
    this.logger.debug(`[${LanguageDetectService.CLASS}.${METHOD}] Called`, {
      hasCode: !!code,
      filename,
      hint,
    });

    const trimmedHint = (hint ?? '').trim();
    if (trimmedHint) {
      this.logger.info(
        `[${LanguageDetectService.CLASS}.${METHOD}] Using 'hint': ${trimmedHint}`
      );
      return this.normalizeHint(trimmedHint);
    }

    const fromName = this.fromFilename(filename);
    if (fromName) {
      this.logger.info(
        `[${LanguageDetectService.CLASS}.${METHOD}] Detected from filename: ${filename} -> ${fromName}`
      );
      return fromName;
    }
    const detected = this.fromContentHeuristics(code);
    this.logger.info(
      `[${LanguageDetectService.CLASS}.${METHOD}] Detected from content heuristics: ${detected}`
    );
    return detected;
  }

  private normalizeHint(hint: string): string {
    const METHOD = 'normalizeHint';
    this.logger.debug(
      `[${LanguageDetectService.CLASS}.${METHOD}] Normalizing hint: ${hint}`
    );
    const h = hint.toLowerCase();
    if (h === 'ts' || h === 'typescript') {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched TypeScript`
      );
      return 'typescript';
    }
    if (h === 'js' || h === 'javascript' || h === 'mjs' || h === 'cjs') {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched JavaScript`
      );
      return 'javascript';
    }
    if (h === 'py' || h === 'python') {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Python`
      );
      return 'python';
    }
    if (h === 'golang' || h === 'go') {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Go`
      );
      return 'go';
    }
    if (h === 'rust' || h === 'rs') {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Rust`
      );
      return 'rust';
    }
    this.logger.debug(
      `[${LanguageDetectService.CLASS}.${METHOD}] No match, returning raw hint`
    );
    return hint;
  }

  private fromFilename(filename?: string): string | null {
    const METHOD = 'fromFilename';
    this.logger.debug(
      `[${LanguageDetectService.CLASS}.${METHOD}] Checking filename: ${filename}`
    );
    if (!filename) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] No filename provided`
      );
      return null;
    }
    const lower = filename.toLowerCase();
    const ext = path.extname(lower);
    const result = extMap[ext] ?? null;
    if (result) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched extension: ${ext} -> ${result}`
      );
    } else {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] No match for extension: ${ext}`
      );
    }
    return result;
  }

  private fromContentHeuristics(code: string): string {
    const METHOD = 'fromContentHeuristics';
    this.logger.debug(
      `[${LanguageDetectService.CLASS}.${METHOD}] Running heuristics`
    );
    const head = code.slice(0, 2000);
    if (/^\s*#!.*python/.test(head) || /^\s*#.*python/.test(head)) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Python shebang or comment`
      );
      return 'python';
    }
    if (head.includes('def ') && /:\s*$/m.test(code.slice(0, 5000))) {
      // Very weak: avoid classifying C as python — require `def foo():` style
      if (/\bdef\s+\w+\s*\(/m.test(head) && /:\s*$/m.test(code.slice(0, 2000))) {
        this.logger.debug(
          `[${LanguageDetectService.CLASS}.${METHOD}] Matched Python function definition`
        );
        return 'python';
      }
    }
    if (/\bpackage\s+main\b/m.test(head) && /\bimport\s+"[^"]+"\b/m.test(head)) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Go`
      );
      return 'go';
    }
    if (/\b(fn|let mut|const)\b/.test(head) && head.includes('use ')) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Rust`
      );
      return 'rust';
    }
    if (/\b(public\s+class|import\s+java\.)/m.test(head)) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched Java`
      );
      return 'java';
    }
    // TypeScript / JavaScript: prefer TS if explicit `type` / `interface` or `as const` etc.
    if (/\b(interface|type\s+\w|as\s+const|satisfies\s+\w|enum\s+\w|namespace\s+\w)\b/m.test(code)) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched TypeScript`
      );
      return 'typescript';
    }
    if (/\b(import|export)\b/.test(head) || /require\(/m.test(head) || /module\.exports/m.test(head)) {
      this.logger.debug(
        `[${LanguageDetectService.CLASS}.${METHOD}] Matched JavaScript`
      );
      return 'javascript';
    }
    this.logger.debug(
      `[${LanguageDetectService.CLASS}.${METHOD}] No matches, returning 'unknown'`
    );
    return 'unknown';
  }
}
