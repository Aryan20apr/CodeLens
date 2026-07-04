import { Send } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import type { LlmService } from '../../../llm/llm.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import { extractTextFromLlmContent } from '../../../review/context/llm-content.util';
import { extractJson } from '../../utils/extract-json.util';
import { AGENT_ROLES, type AgentRole } from '../../../review/types/agent-prompt.types';

const AGENT_NODE: Record<AgentRole, string> = {
  security: 'securityAgent',
  performance: 'perfAgent',
  best_practices: 'bpAgent',
};

const TriageDecisionSchema = z.object({
  route: z.enum(['simple', 'specialized']),
  agents: z.array(z.enum(['security', 'performance', 'best_practices'])).optional(),
  reasoning: z.string().optional(),
});

type TriageDecision = z.infer<typeof TriageDecisionSchema>;

const TRIAGE_SYSTEM = `You are a PR review router. Based on the PR digest below, decide:
1. Whether this PR needs specialized multi-agent review ("specialized") or a single general-purpose review ("simple").
2. If specialized, which agents should run.

Return ONLY valid JSON matching this schema exactly:
{
  "route": "simple" | "specialized",
  "agents": ["security", "performance", "best_practices"],
  "reasoning": "one sentence"
}

"agents" is required when route is "specialized". Rules for agents:
- Always include "best_practices" — correctness, error handling, and null guards are relevant to every substantive code change.
- Include "security" when ANY of these are touched: auth, sessions, JWT/tokens, cryptography, DB queries with user input, file system access, external HTTP calls, input validation, environment secrets.
- Include "performance" when ANY of these are touched: DB query loops, large collection iteration, async patterns, caching logic, memory-sensitive structures, render cycles, pagination.

Route rules:
Choose "simple" when ALL of the following are true:
- Changes are primarily formatting, linting, style, or whitespace
- OR diff is trivially small (< 20 added lines) with no logic changes
- OR changes are limited to documentation, comments, or string literals
- OR changes are purely mechanical: rename, move files, sort imports, lock file bump

Choose "specialized" when ANY of the following is true:
- New logic, algorithms, or control flow is introduced
- Auth, sessions, DB queries, or external API calls are touched
- Public APIs, exports, or function signatures change
- New dependencies are added or existing ones are upgraded
- More than 3 files contain substantive code changes
- Security-sensitive paths are modified`;

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

function parseTriageDecision(raw: string): TriageDecision {
  try {
    const parsed = JSON.parse(extractJson(raw));
    return TriageDecisionSchema.parse(parsed);
  } catch {
    return { route: 'specialized', agents: [...AGENT_ROLES] };
  }
}

// ─── Routing function ───────────────

export function routeAfterTriage(state: PrReviewGraphStateType): Send[] {
  if (state.analysisRoute === 'simple') {
    return [new Send('simpleAnalyze', state)];
  }
  const agents: AgentRole[] =
    state.selectedAgents?.length ? state.selectedAgents : [...AGENT_ROLES];
  return agents.map((role) => new Send(AGENT_NODE[role], state));
}

// ─── Node ────────────────────────────────────────────────────────────────────

type TriageUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    'analysisRoute' | 'selectedAgents' | 'events' | 'error' | 'status'
  >
>;

export function createTriageAnalysisNode(
  llm: LlmService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<TriageUpdate> {
  return async (state) => {
    const { reviewRunId } = state;

    if (state.chunks.length === 0) {
      return { analysisRoute: 'simple', selectedAgents: [] };
    }

    const { result: decision, events } = await runPrSteps(reviewRunId, progress, [
      {
        step: 'triaging',
        graphNode: 'triageAnalysis',
        meta: {
          fileCount: state.fileIndex.length,
          addedLines: state.chunks.reduce((n, c) => n + c.addedLines.length, 0),
        },
        fn: async () => {
          const model = llm.getChatModel();
          const response = await model.invoke([
            new SystemMessage(TRIAGE_SYSTEM),
            new HumanMessage(buildTriageDigest(state)),
          ]);
          const raw = extractTextFromLlmContent(response.content);
          return parseTriageDecision(raw);
        },
      },
    ]);

    const selectedAgents: AgentRole[] =
      decision.route === 'specialized'
        ? (decision.agents ?? [...AGENT_ROLES])
        : [];

    await progress.stepCompleted(reviewRunId, 'triaging', {
      analysisRoute: decision.route,
      selectedAgents,
      reasoning: decision.reasoning,
    });

    return { analysisRoute: decision.route, selectedAgents, events };
  };
}
