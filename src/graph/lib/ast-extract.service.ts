import { Inject, Injectable, } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import path from 'path';
import type { Logger } from 'winston';
import type { Node, Tree } from 'web-tree-sitter';
import { CodeMetadata } from '../state.types';
import { TreeSitterService } from './tree-sitter/tree-sitter.service';
import { QueryLoaderService } from './queries/query-loader.service';

export type CodeSymbol = {
  name: string;
  startLine: number;
  endLine: number;
};

@Injectable()
export class AstExtractService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly treeSitter: TreeSitterService,
    private readonly queries: QueryLoaderService,
  ) {
    this.logger = logger.child({ context: AstExtractService.name });
  }

  async buildMetadata(code: string, languageId: string): Promise<CodeMetadata> {
    const linesOfCode = this.countLoc(code);

    // If no grammar, return shallow metadata
    const tree = await this.treeSitter.parse(languageId, code);
    if (!tree) {
      return this.emptyMetadata(linesOfCode);
    }

    let bundle: ReturnType<QueryLoaderService['getQueries']>;
    try {
      bundle = this.queries.getQueries(languageId);
    } catch (e) {
      this.logger.warn(
        `Missing/invalid query file for ${languageId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.emptyMetadata(linesOfCode);
    }

    const lang = await this.treeSitter.getLanguage(languageId);
    if (!lang) return this.emptyMetadata(linesOfCode);

    const functions = this.extractSymbols(lang, tree, bundle.functions, 'function.name');
    const classes = this.extractSymbols(lang, tree, bundle.classes, 'class.name');

    const imports = this.extractStrings(lang, tree, bundle.imports, 'import.source')
      .map(this.stripQuotes)
      .filter(Boolean);

    const entryPoints = bundle.entryPoints
      ? this.extractStrings(lang, tree, bundle.entryPoints, 'entry')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

    return {
      linesOfCode,
      functions,
      classes,
      imports: uniq(imports),
      entryPoints: uniq(entryPoints),

      functionCount: functions.length,
      classCount: classes.length,
      importCount: uniq(imports).length,

      maxCyclomaticComplexity: null, // TODO: Determine this
      averageCyclomaticComplexity: null // TODO: DETERMINE THIS
    };
  }

  // ---------------- helpers ----------------

  private emptyMetadata(linesOfCode: number): CodeMetadata {
    return {
      linesOfCode,
      functions: [],
      classes: [],
      imports: [],
      entryPoints: [],
      functionCount: 0,
      classCount: 0,
      importCount: 0,
      maxCyclomaticComplexity: 0,
      averageCyclomaticComplexity: 0
    };
  }

  private extractSymbols(
    language: any,
    tree: Tree,
    queryText: string,
    captureName: string,
  ): CodeSymbol[] {
    const q = language.query(queryText);
    const matches = q.matches(tree.rootNode);

    const out: CodeSymbol[] = [];
    for (const m of matches) {
      for (const c of m.captures) {
        if (c.name !== captureName) continue;
        const node = c.node as Node;
        const name = node.text?.trim();
        if (!name) continue;
        out.push({
          name,
          startLine: (node.startPosition?.row ?? 0) + 1,
          endLine: (node.endPosition?.row ?? 0) + 1,
        });
      }
    }
    return out;
  }

  private extractStrings(
    language: any,
    tree: Tree,
    queryText: string,
    captureName: string,
  ): string[] {
    const q = language.query(queryText);
    const matches = q.matches(tree.rootNode);

    const out: string[] = [];
    for (const m of matches) {
      for (const c of m.captures) {
        if (c.name !== captureName) continue;
        const node = c.node as Node;
        const text = node.text;
        if (text) out.push(text);
      }
    }
    return out;
  }

  private stripQuotes(s: string): string {
    const t = s.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('`') && t.endsWith('`'))
    ) {
      return t.slice(1, -1);
    }
    return t;
  }

  private countLoc(code: string): number {
    return code
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .length;
  }
}