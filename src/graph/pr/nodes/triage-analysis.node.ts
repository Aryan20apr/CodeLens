import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { LlmService } from '../../../llm/llm.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import { extractTextFromLlmContent } from '../../../review/context/llm-content.util';

const TRIAGE_SYSTEM = `You are a PR review router. Based on the PR digest below, decide whether this PR warrants specialized multi-agent analysis, or whether a single general-purpose review is sufficient.

Return ONLY one word: "simple" or "specialized". No punctuation. No explanation.

Choose "simple" when ALL of the following are true:
- The changes are primarily formatting, linting, style, or whitespace
- OR the diff is trivially small (< 20 added lines) with no, minimal or simple logic changes
- OR changes are limited to documentation, comments, or string literals
- OR changes are purely mechanical: rename, move files, sort imports, version bump in lock file

Choose "specialized" when ANY of the following is true:
- New logic, algorithms, or control flow is introduced
- Authentication, sessions, DB queries, or external API calls are touched
- Public APIs, exports, or function signatures change
- New dependencies are added or existing ones are upgraded
- More than 3 files contain substantive code changes (not just formatting)
- Security-sensitive paths are modified (auth, crypto, input handling, file access)`;



function buildTriageDigest(state: PrReviewGraphStateType): string {
    const files = (state.apiFileIndex ?? state.fileIndex)
      .map((f) => `  - ${f.path} [${f.status}] +${f.additions}/-${f.deletions}`)
      .join('\n');
  
    const addedLines = state.chunks.reduce((n, c) => n + c.addedLines.length, 0);
  
    const symbolSample = (state.fileContexts ?? [])
      .filter((c) => c.fetchStatus === 'ok' && c.metadata)
      .flatMap((c) =>
        c.metadata!.functions.slice(0, 3).map((f) => `${c.filePath}::${f.name}`),
      )
      .slice(0, 10)
      .join(', ');
  
    const importSample = (state.fileContexts ?? [])
      .filter((c) => c.fetchStatus === 'ok' && c.metadata)
      .flatMap((c) => c.metadata!.imports.slice(0, 4))
      .slice(0, 12)
      .join(', ');
  
    return [
      `PR: ${state.prTitle ?? `#${state.prNumber}`}`,
      `Files changed: ${state.fileIndex.length} (${state.removedOnlyFileCount} removal-only, ${state.binaryOrEmptyFileCount} binary/empty)`,
      `Added lines across all chunks: ${addedLines}`,
      `Changed files:\n${files}`,
      symbolSample ? `Changed symbols (sample): ${symbolSample}` : '',
      importSample ? `Imports in changed files (sample): ${importSample}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  
  type TriageUpdate = Partial<
    Pick<PrReviewGraphStateType, 'analysisRoute' | 'events' | 'error' | 'status'>
  >;
  
  export function createTriageAnalysisNode(
    llm: LlmService,
    progress: PrReviewProgressPublisher,
  ): (state: PrReviewGraphStateType) => Promise<TriageUpdate> {
    return async (state) => {
      const { reviewRunId } = state;
  
      // If there are no chunks at all, short-circuit to simple — nothing substantive to route
      if (state.chunks.length === 0) {
        return { analysisRoute: 'simple' };
      }
  
      const { result: analysisRoute, events } = await runPrSteps(
        reviewRunId,
        progress,
        [
          {
            step: 'triaging',
            graphNode: 'triageAnalysis',
            meta: {
              fileCount: state.fileIndex.length,
              addedLines: state.chunks.reduce((n, c) => n + c.addedLines.length, 0),
            },
            fn: async () => {
              const model = llm.getChatModel();
              const digest = buildTriageDigest(state);
              const response = await model.invoke([
                new SystemMessage(TRIAGE_SYSTEM),
                new HumanMessage(digest),
              ]);
              const text = extractTextFromLlmContent(response.content)
                .trim()
                .toLowerCase()
                .replace(/[^a-z_]/g, '');
  
              // Normalise — default to 'specialized' if the model returns anything unexpected
              const route: 'simple' | 'specialized' =
                text === 'simple' ? 'simple' : 'specialized';
  
              return route;
            },
          },
        ],
      );
  
      await progress.stepCompleted(reviewRunId, 'triaging', { analysisRoute });
  
      return { analysisRoute, events };
    };
  }