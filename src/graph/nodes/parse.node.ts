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

// Simple singleton logger using console, can be elevated later
const LOG_TAG = "ParseNode";
function log(method: string, level: "debug" | "info" | "warn" | "error", message: string, extra?: unknown) {
  const meta = extra ? ` | ${JSON.stringify(extra)}` : '';
  // Format: [ClassName.methodName] [level] Message
  // eslint-disable-next-line no-console
  console[level](`[${LOG_TAG}.${method}] ${message}${meta}`);
}

export function createParseNode(
  language: LanguageDetectService,
  astExtract: AstExtractService,
): (state: SnippetGraphStateType) => Promise<ParseUpdate> {
  const methodName = "createParseNode";
  log(methodName, "debug", "Initializing parse node factory");
  return async (state) => {
    const fnName = "parseSnippet";
    const now = () => new Date().toISOString();

    log(fnName, "debug", "Invoked with state", {
      hasSource: !!state.source,
      language: state.source?.language,
      filename: state.source?.filename,
    });

    if (!state.source) {
      log(fnName, "error", "Missing state.source – cannot parse.");
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

    log(fnName, "info", "Starting parse step", {
      filename: state.source.filename,
      language: state.source.language,
    });

    try {
      log(fnName, "debug", "Detecting language...");
      const detected = language.detectLanguage(
        state.source.code,
        state.source.filename,
        state.source.language,
      );
      log(fnName, "info", `Detected language: ${detected}`);
      log(fnName, "debug", "Extracting AST metadata...");
      const metadata = await astExtract.buildMetadata(
        state.source.code,
        detected,
      );
      log(fnName, "info", "Parse and AST extraction complete", {
        language: detected,
        hasMetadata: !!metadata,
      });
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
      log(
        fnName,
        "error",
        `Parse failed: ${message}${e instanceof Error && e.stack ? `\nStacktrace:\n${e.stack}` : ""}`,
        e
      );
 
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
