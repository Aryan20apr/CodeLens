import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type QueryBundle = {
  /** Used by AstExtractService */
  functions: string;
  classes: string;
  imports: string;
  entryPoints: string;
};

@Injectable()
export class QueryLoaderService {
  private cache = new Map<string, QueryBundle>();

  /**
   * Loads a single .scm file per language and splits it into named blocks.
   *
   * File format (recommended):
   *
   * ;--- functions
   * (function_declaration name: (identifier) @function.name)
   *
   * ;--- classes
   * (class_declaration name: (type_identifier) @class.name)
   *
   * ;--- imports
   * (import_statement source: (string) @import.source)
   *
   * ;--- entry_points
   * (export_statement ...) @entry
   */
  getQueries(languageId: string): QueryBundle {
    const key = this.normalize(languageId);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const filePath = join(process.cwd(), 'src', 'modules', 'graph', 'lib', 'queries', `${key}.scm`);
    const text = readFileSync(filePath, 'utf8');

    const bundle = this.parseBlocks(text);
    this.cache.set(key, bundle);
    return bundle;
  }

  private normalize(languageId: string): string {
    const l = (languageId || '').toLowerCase().trim();
    if (l === 'ts' || l === 'tsx') return 'typescript';
    if (l === 'js' || l === 'jsx') return 'javascript';
    if (l === 'py') return 'python';
    if (l === 'golang') return 'go';
    if (l === 'rs') return 'rust';
    if (l === 'c#') return 'csharp';
    return l || 'unknown';
  }

  private parseBlocks(text: string): QueryBundle {
    const sections: Record<string, string[]> = {
      functions: [],
      classes: [],
      imports: [],
      entry_points: [],
    };

    let current: keyof typeof sections | null = null;

    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*;---\s*([a-zA-Z0-9_]+)\s*$/);
      if (m) {
        const name = m[1].toLowerCase();
        if (name === 'functions') current = 'functions';
        else if (name === 'classes') current = 'classes';
        else if (name === 'imports') current = 'imports';
        else if (name === 'entry_points' || name === 'entrypoints') current = 'entry_points';
        else current = null;
        continue;
      }
      if (current) sections[current].push(line);
    }

    const toText = (k: keyof typeof sections) => sections[k].join('\n').trim();

    const functions = toText('functions');
    const classes = toText('classes');
    const imports = toText('imports');
    const entryPoints = toText('entry_points');

    if (!functions || !classes || !imports) {
      // entry_points can be empty
      throw new Error(
        'Invalid .scm format. Ensure blocks exist: ;--- functions, ;--- classes, ;--- imports (entry_points optional)',
      );
    }

    return {
      functions,
      classes,
      imports,
      entryPoints: entryPoints || '',
    };
  }
}