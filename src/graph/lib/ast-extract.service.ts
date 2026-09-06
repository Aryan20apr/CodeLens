import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import path from 'path';
import type { Logger } from 'winston';
import { Query, type Language, type Node, type QueryMatch, type Tree } from 'web-tree-sitter';
import { CodeMetadata } from '../state.types';
import { TreeSitterService } from './tree-sitter/tree-sitter.service';
import { QueryLoaderService } from './queries/query-loader.service';

export type CodeSymbol = {
  name: string;
  startLine: number;
  endLine: number;
};

@Injectable()
export class AstExtractService implements OnModuleDestroy {
  private readonly logger: Logger;
  private readonly queryCache = new Map<string, Query>();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly treeSitter: TreeSitterService,
    private readonly queries: QueryLoaderService,
  ) {
    this.logger = logger.child({ context: AstExtractService.name });
  }

  onModuleDestroy() {
    for (const q of this.queryCache.values()) {
      try {
        q.delete();
      } catch {
        // ignore cleanup error
      }
    }
    this.queryCache.clear();
  }

  async buildMetadata(code: string, languageId: string): Promise<CodeMetadata> {
    const className = AstExtractService.name;
    const methodName = "buildMetadata";
    this.logger.debug(`[${className}.${methodName}] Called`, {
      languageId,
      codeLength: code.length
    });

    const linesOfCode = this.countLoc(code);

    // If no grammar, return shallow metadata
    this.logger.debug(`[${className}.${methodName}] Parsing code using TreeSitterService.parse`);
    const tree = await this.treeSitter.parse(languageId, code);
    if (!tree) {
      this.logger.warn(`[${className}.${methodName}] No parse tree found, returning empty metadata`);
      return this.emptyMetadata(linesOfCode);
    }

    try {
      let bundle: ReturnType<QueryLoaderService['getQueries']>;
      try {
        this.logger.debug(`[${className}.${methodName}] Loading queries for languageId=${languageId}`);
        bundle = this.queries.getQueries(languageId);
      } catch (e) {
        this.logger.warn(
          `[${className}.${methodName}] Missing/invalid query file for ${languageId}: ${e instanceof Error ? e.message : String(e)}`
        );
        return this.emptyMetadata(linesOfCode);
      }

      this.logger.debug(`[${className}.${methodName}] Retrieving language from TreeSitterService`);
      const lang = await this.treeSitter.getLanguage(languageId);
      if (!lang) {
        this.logger.warn(`[${className}.${methodName}] Language not found for languageId=${languageId}, returning empty metadata`);
        return this.emptyMetadata(linesOfCode);
      }

      return this.extractMetadataFromTree(languageId, lang, tree, bundle, linesOfCode);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`[${className}.${methodName}] Metadata extraction failed`, {
        languageId,
        errorMessage,
        errorStack,
      });
      throw err;
    } finally {
      tree.delete();
    }
  }

  // ---------------- helpers ----------------

  private extractMetadataFromTree(
    languageId: string,
    lang: Language,
    tree: Tree,
    bundle: ReturnType<QueryLoaderService['getQueries']>,
    linesOfCode: number,
  ): CodeMetadata {
    const className = AstExtractService.name;
    const methodName = "buildMetadata";

    this.logger.debug(`[${className}.${methodName}] Extracting function symbols`);
    const functions = this.extractSymbols(
      languageId,
      lang,
      tree,
      'functions',
      bundle.functions,
      'function.name',
    );

    this.logger.debug(`[${className}.${methodName}] Extracting class symbols`);
    const classes = bundle.classes
      ? this.extractSymbols(
          languageId,
          lang,
          tree,
          'classes',
          bundle.classes,
          'class.name',
        )
      : [];

    this.logger.debug(`[${className}.${methodName}] Extracting imports`);
    const imports = this.extractStrings(
      languageId,
      lang,
      tree,
      'imports',
      bundle.imports,
      'import.source',
    )
      .map((s) => this.stripQuotes(s))
      .filter(Boolean);

    this.logger.debug(`[${className}.${methodName}] Extracting entry points`);
    const entryPoints = bundle.entryPoints
      ? this.extractStrings(
          languageId,
          lang,
          tree,
          'entry_points',
          bundle.entryPoints,
          'entry',
        )
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

    this.logger.info(`[${className}.${methodName}] Metadata extraction complete`, {
      functionsCount: functions.length,
      classesCount: classes.length,
      importCount: uniq(imports).length,
      entryPointCount: uniq(entryPoints).length,
      linesOfCode,
    });

    return {
      linesOfCode,
      functions,
      classes,
      imports: uniq(imports),
      entryPoints: uniq(entryPoints),

      functionCount: functions.length,
      classCount: classes.length,
      importCount: uniq(imports).length,

      maxCyclomaticComplexity: null,
      averageCyclomaticComplexity: null,
    };
  }

  private emptyMetadata(linesOfCode: number): CodeMetadata {
    const className = AstExtractService.name;
    const methodName = "emptyMetadata";
    this.logger.debug(`[${className}.${methodName}] Creating empty metadata object (linesOfCode=${linesOfCode})`);
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

  private getCompiledQuery(
    languageId: string,
    language: Language,
    queryType: string,
    queryText: string,
  ): Query {
    const key = `${languageId}:${queryType}`;
    let q = this.queryCache.get(key);
    if (!q) {
      q = new Query(language, queryText);
      this.queryCache.set(key, q);
    }
    return q;
  }

  private runQuery(
    languageId: string,
    language: Language,
    queryType: string,
    queryText: string,
    tree: Tree,
  ): QueryMatch[] {
    const q = this.getCompiledQuery(languageId, language, queryType, queryText);
    return q.matches(tree.rootNode);
  }

  private extractSymbols(
    languageId: string,
    language: Language,
    tree: Tree,
    queryType: string,
    queryText: string,
    captureName: string,
  ): CodeSymbol[] {
    const className = AstExtractService.name;
    const methodName = "extractSymbols";
    this.logger.debug(`[${className}.${methodName}] Running symbols extraction`, {
      captureName,
      queryTextShort: queryText?.slice(0, 30)
    });

    const matches = this.runQuery(languageId, language, queryType, queryText, tree);
    const defCaptureName = captureName.replace('.name', '.def');

    const out: CodeSymbol[] = [];
    for (const m of matches) {
      const nameCap = m.captures.find((c) => c.name === captureName);
      if (!nameCap) continue;
      const node = nameCap.node as Node;
      const name = node.text?.trim();
      if (!name) continue;

      const defCap = m.captures.find((c) => c.name === defCaptureName);
      const spanNode = (defCap?.node ?? node.parent ?? node) as Node;

      out.push({
        name,
        startLine: (spanNode.startPosition?.row ?? 0) + 1,
        endLine: (spanNode.endPosition?.row ?? 0) + 1,
      });
    }
    this.logger.debug(`[${className}.${methodName}] Extracted ${out.length} symbols for ${captureName}`);
    return out;
  }

  private extractStrings(
    languageId: string,
    language: Language,
    tree: Tree,
    queryType: string,
    queryText: string,
    captureName: string,
  ): string[] {
    const className = AstExtractService.name;
    const methodName = "extractStrings";
    this.logger.debug(`[${className}.${methodName}] Extracting strings`, {
      captureName,
      queryTextShort: queryText?.slice(0, 30)
    });

    const matches = this.runQuery(languageId, language, queryType, queryText, tree);

    const out: string[] = [];
    for (const m of matches) {
      for (const c of m.captures) {
        if (c.name !== captureName) continue;
        const node = c.node as Node;
        const text = node.text;
        if (text) out.push(text);
      }
    }
    this.logger.debug(`[${className}.${methodName}] Extracted ${out.length} strings for ${captureName}`);
    return out;
  }

  private stripQuotes(s: string): string {
    const className = AstExtractService.name;
    const methodName = "stripQuotes";
    const t = s.trim();
    let result: string;
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('`') && t.endsWith('`'))
    ) {
      result = t.slice(1, -1);
    } else {
      result = t;
    }
    this.logger.debug(`[${className}.${methodName}] Stripping quotes`, { from: s, to: result });
    return result;
  }

  private countLoc(code: string): number {
    const className = AstExtractService.name;
    const methodName = "countLoc";
    const count = code
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .length;
    this.logger.debug(`[${className}.${methodName}] Counted LOC`, { count });
    return count;
  }
}
