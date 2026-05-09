import { LanguageDetectService } from "../lib/language-detect.service";
import { AstExtractService } from "../lib/ast-extract.service";

import type { SnippetGraphStateType } from "../state.annotation";

type ParseUpdate = Pick<SnippetGraphStateType, 'source' | 'language' | 'metadata' | 'status' | 'error'>;

export function createParseNode(language: LanguageDetectService, astExtract: AstExtractService): (state: SnippetGraphStateType) => Promise<Partial<ParseUpdate>> {
    return async (state) => {
      if (!state.source) {
        return { status: 'failed', error: 'Missing state.source' };
      }
      try {
        const detected = language.detectLangauge(
          state.source.code,
          state.source.filename,
          state.source.language,
        );
        const metadata = await astExtract.buildMetadata(state.source.code, detected);
        return { language: detected, metadata, status: 'complete', error: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { status: 'failed', error: message };
      }
    };
  }