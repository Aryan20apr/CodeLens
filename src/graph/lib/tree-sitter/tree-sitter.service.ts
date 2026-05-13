import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { Language, Parser, Tree } from 'web-tree-sitter';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';

// tree-sitter-wasms ships many prebuilt grammars.
// The exact export shape can vary by version, so we keep this dynamic.
const requireFn = createRequire(__filename);

export type SupportedLangId =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'unknown'
  | string;

type TSParser = Parser;
type TSLanguage = Language;

@Injectable()
export class TreeSitterService {
  private readonly logger: Logger;
  private initPromise: Promise<void> | null = null;
  private languageCache = new Map<string, TSLanguage>();
  private parserCache = new Map<string, TSParser>();

  constructor(@Inject(WINSTON_MODULE_PROVIDER) logger: Logger) {
    this.logger = logger.child({ context: TreeSitterService.name });
  }

  /**
   * Initialize the Tree-sitter WASM runtime exactly once.
   */
  async initOnce(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await Parser.init();
        this.logger.info('Tree-sitter WASM runtime initialized');
      })();
    }
    return this.initPromise;
  }
  /**
   * Returns a cached Parser instance for this language.
   * If the language is unsupported, returns null.
   */
  async getParser(languageId: SupportedLangId): Promise<TSParser | null> {
    const lang = await this.getLanguage(languageId);
    if (!lang) return null;

    const key = this.normalizeLangId(languageId);
    const existing = this.parserCache.get(key);
    if (existing) return existing;

    const parser = new Parser();
    parser.setLanguage(lang);
    this.parserCache.set(key, parser);
    return parser;
  }

   /**
   * Load a language grammar from tree-sitter-wasms and cache it.
   */
   async getLanguage(languageId: SupportedLangId): Promise<TSLanguage | null> {
    await this.initOnce();

    const key = this.normalizeLangId(languageId);
    if (key === 'unknown') return null;

    const cached = this.languageCache.get(key);
    if (cached) return cached;

    const wasmBytes = await this.loadWasmBytesForLanguage(key);
    if (!wasmBytes) {
      this.logger.warn(`No Tree-sitter WASM grammar found for language: ${key}`);
      return null;
    }

    const wasmInput =
      wasmBytes instanceof Uint8Array ? wasmBytes : new Uint8Array(wasmBytes);
    const lang = await Language.load(wasmInput);
    this.languageCache.set(key, lang);
    return lang;
}
  /**
   * Parse code and return Tree-sitter syntax tree.
   * Returns null if grammar unavailable.
   */
  async parse(languageId: SupportedLangId, code: string): Promise<Tree | null> {
    const parser = await this.getParser(languageId);
    if (!parser) return null;
    return parser.parse(code);
  }

  // ----------------- helpers -----------------

  private normalizeLangId(languageId: string): string {
    const l = (languageId || '').toLowerCase().trim();

    // normalize common variants
    if (l === 'ts' || l === 'typescript' || l === 'tsx') return 'typescript';
    if (l === 'js' || l === 'javascript' || l === 'jsx') return 'javascript';
    if (l === 'py' || l === 'python') return 'python';
    if (l === 'golang' || l === 'go') return 'go';
    if (l === 'rs' || l === 'rust') return 'rust';
    if (l === 'c#' || l === 'csharp') return 'csharp';

    if (!l) return 'unknown';
    return l;
  }

  /**
   * tree-sitter-wasms versions differ. Some expose:
   *  - getLanguage('typescript')
   *  - languages.typescript()
   *  - wasmByLanguage['typescript']
   *
   * This loader tries common shapes and returns a Uint8Array/ArrayBuffer.
   */
  private async loadWasmBytesForLanguage(lang: string): Promise<Uint8Array | ArrayBuffer | null> {
    const anyPack = this.tryLoadWasmPackagerRoot();

    try {
      if (typeof anyPack.getLanguage === 'function') {
        // Some builds return Parser.Language directly; others return { wasm, language }.
        const res = await anyPack.getLanguage(lang);
        if (res?.language && res?.wasm) return res.wasm;
        if (res?.wasm) return res.wasm;
        // If it's already a Language, we can't load it again; handle upstream by bypassing.
        if (res && typeof res.query === 'function') {
          // It's a Language object; but we still need to return it.
          // We can't here; so fall through to other shapes.
        }
      }
    } catch (e) {
      // ignore and try other shapes
    }

    // Common: anyPack.wasmByLanguage[lang]
    const wasmByLanguage = anyPack.wasmByLanguage ?? anyPack.WASM_BY_LANGUAGE;
    if (wasmByLanguage && wasmByLanguage[lang]) {
      const v = wasmByLanguage[lang];
      return typeof v === 'function' ? await v() : await v;
    }

    // Common: anyPack.languages[lang]() or anyPack.languages[lang]
    const languages = anyPack.languages ?? anyPack.LANGUAGES;
    if (languages && languages[lang]) {
      const v = languages[lang];
      // Some return { wasm } or raw wasm
      const out = typeof v === 'function' ? await v() : await v;
      if (out?.wasm) return out.wasm;
      if (out instanceof Uint8Array || out instanceof ArrayBuffer) return out;
    }


    const direct = anyPack[lang];
    if (direct) {
      const out = typeof direct === 'function' ? await direct() : await direct;
      if (out?.wasm) return out.wasm;
      if (out instanceof Uint8Array || out instanceof ArrayBuffer) return out;
    }

    // Fallback: stable contract is the wasm artifacts under `tree-sitter-wasms/out`.
    return (await this.loadWasmBytesFromOut(lang)) ?? null;
  }

  private tryLoadWasmPackagerRoot(): any {
    try {
      // Some published versions have a broken `main` entry (missing `bindings/node`),
      // so we load it dynamically and ignore failures.
      return requireFn('tree-sitter-wasms') as any;
    } catch {
      return {} as any;
    }
  }

  private async loadWasmBytesFromOut(lang: string): Promise<Uint8Array | ArrayBuffer | null> {
    const wasmBaseByLang: Record<string, string> = {
      // Matches files under `node_modules/tree-sitter-wasms/out/`
      typescript: 'tree-sitter-typescript',
      javascript: 'tree-sitter-javascript',
      python: 'tree-sitter-python',
      go: 'tree-sitter-go',
      rust: 'tree-sitter-rust',
      java: 'tree-sitter-java',
      kotlin: 'tree-sitter-kotlin',
      csharp: 'tree-sitter-c_sharp',
      php: 'tree-sitter-php',
      ruby: 'tree-sitter-ruby',
      swift: 'tree-sitter-swift',
    };

    const base = wasmBaseByLang[lang];
    if (!base) return null;

    try {
      const wasmPath = requireFn.resolve(`tree-sitter-wasms/out/${base}.wasm`);
      const buf = await fs.readFile(wasmPath);
      return buf;
    } catch {
      return null;
    }
  }
}
