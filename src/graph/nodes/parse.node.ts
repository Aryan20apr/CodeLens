import { LanguageDetectService } from '../lib/language-detect.service';
import { AstExtractService } from '../lib/ast-extract.service';

import type { SnippetGraphStateType } from '../state.annotation';

/**
 * - Emit `parsing` lifecycle (status + events).
 * - Never overwrite an existing fatal `error` (state.annotation.ts now first-wins).
 */

type ParseUpdate = Partial<
  Pick<
    SnippetGraphStateType,
    'source' | 'language' | 'metadata' | 'status' | 'error' | 'events'
  >
>;

export function createParseNode(
  language: LanguageDetectService,
  astExtract: AstExtractService,
): (state: SnippetGraphStateType) => Promise<ParseUpdate> {
  return async (state) => {
    const now = () => new Date().toISOString();
    if (!state.source) {
      return {
        status: 'failed',
        error: 'Missing state.source',
        events: [
          {
            node: 'parse',
            status: 'failed',
            message: 'Missing state.source',
            at: now(),
          },
        ],
      };
    }

    const startUpdate: ParseUpdate = {
      status: 'parsing',
      events: [
        {
          node: 'parse',
          status: 'started',
          message: 'Parsing snippet',
          at: now(),
        },
      ],
    };
    try {
      const detected = language.detectLanguage(
        state.source.code,
        state.source.filename,
        state.source.language,
      );
      const metadata = await astExtract.buildMetadata(
        state.source.code,
        detected,
      );
      return {
        ...startUpdate,
        language: detected,
        metadata,
        status: 'complete',
        error: null,
        events: (startUpdate.events ?? []).concat([
          {
            node: 'parse',
            status: 'completed',
            message: 'Parse complete',
            at: now(),
          },
        ]),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ...startUpdate,
        status: "failed",
        error: message,
        events: (startUpdate.events ?? []).concat([
          { node: "parse", status: "failed", message, at: now() },
        ]),
      };
    }
  };
}
