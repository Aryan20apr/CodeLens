import { Send } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import type { LlmService } from '../../../llm/llm.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import { extractTextFromLlmContent } from '../../../review/context/llm-content.util';
import { extractJson } from '../../utils/extract-json.util';
import {
  AGENT_ROLES,
  type AgentRole,
} from '../../../review/types/agent-prompt.types';

const AGENT_NODE: Record<AgentRole, string> = {
  security: 'securityAgent',
  performance: 'perfAgent',
  best_practices: 'bpAgent',
};

const TriageDecisionSchema = z.object({
  route: z.enum(['simple', 'specialized']),
  agents: z
    .array(z.enum(['security', 'performance', 'best_practices']))
    .optional(),
  reasoning: z.string().optional(),
});

type TriageDecision = z.infer<typeof TriageDecisionSchema>;

const TRIAGE_SYSTEM = `
You are CodeLens Triage, responsible for selecting the appropriate review strategy for a pull request.

Your goal is to determine:
1. Whether the PR can be adequately reviewed by a single general-purpose reviewer ("simple"), or
2. Whether specialized reviewers should be invoked ("specialized").

Return ONLY valid JSON matching this schema:

{
  "route": "simple" | "specialized",
  "agents": ["security", "performance", "best_practices"],
  "reasoning": "one sentence"
}

Decision philosophy:

- Prefer false positives over false negatives.
- If there is reasonable doubt, choose "specialized".
- Missing a relevant reviewer is worse than running an unnecessary reviewer.
- Evaluate the semantic impact of the changes, not just diff size.

Review the entire PR digest and determine whether the changes introduce, modify, or affect:
- Application behavior
- Data flow
- Control flow
- Public interfaces
- Resource utilization
- Security boundaries

Route selection:

Choose "simple" ONLY when the changes are clearly low-risk and non-behavioral.

Examples:
- Formatting
- Whitespace
- Lint fixes
- Documentation
- Comments
- String copy changes
- Import ordering
- File moves without behavioral changes
- Pure renames
- Lockfile updates with no relevant dependency changes

Choose "specialized" for any change that may affect behavior, correctness, security, performance, reliability, maintainability, or scalability.

Agent selection:

Always include:
- "best_practices"

Include:
- "security" whenever changes affect trust boundaries, authentication, authorization, secrets, user-controlled input, external integrations, data access, file handling, network communication, configuration, infrastructure, or anything that could plausibly impact security.

Include:
- "performance" whenever changes affect execution paths, algorithms, data processing, collections, database access, caching, rendering, concurrency, memory usage, I/O, networking, batching, pagination, or scalability.

When uncertain whether an agent is needed, include it.

Reasoning requirements:
- One concise sentence.
- Explain why the selected route and agents are appropriate.
- Do not mention the prompt or internal rules.
`;

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
  const agents: AgentRole[] = state.selectedAgents?.length
    ? state.selectedAgents
    : [...AGENT_ROLES];
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
): (state: PrReviewGraphStateType, config?: any) => Promise<TriageUpdate> {
  return async (state, config) => {
    const { reviewRunId } = state;

    if (state.chunks.length === 0) {
      return { analysisRoute: 'simple', selectedAgents: [] };
    }

    const { result: decision, events } = await runPrSteps(
      reviewRunId,
      progress,
      [
        {
          step: 'triaging',
          graphNode: 'triageAnalysis',
          meta: {
            fileCount: state.fileIndex.length,
            addedLines: state.chunks.reduce(
              (n, c) => n + c.addedLines.length,
              0,
            ),
          },
          fn: async () => {
            const userLlmKey = config?.configurable?.userLlmKey;
            const model = llm.getChatModel(userLlmKey);
            const response = await model.invoke([
              new SystemMessage(TRIAGE_SYSTEM),
              new HumanMessage(buildTriageDigest(state)),
            ]);
            const raw = extractTextFromLlmContent(response.content);
            return parseTriageDecision(raw);
          },
        },
      ],
    );

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
