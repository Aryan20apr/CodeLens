import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import type { Finding, FindingSeverity } from '../../../graph/state.types';
import { AGENT_ROLES, AGENT_ROLE_LABEL } from '../../../review/types/agent-prompt.types';

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function deduplicateFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const finding of findings) {
    if (!finding.filePath) continue;
    const key = `${finding.filePath}:${finding.location.startLine}:${finding.category}`;
    const existing = map.get(key);
    if (
      !existing ||
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]
    ) {
      map.set(key, finding);
    }
  }
  return [...map.values()];
}

function buildCombinedSummary(
  summaries: Array<{ role: string; summary: string }>,
): string {
  if (summaries.length === 0) {
    return 'No significant issues found.';
  }

   // Simple path: single general-purpose summary — return it directly without role headers
   if (summaries.length === 1 && summaries[0].role === 'general') {
    return summaries[0].summary.trim();
  }

   // Specialized path: one section per agent in canonical role order
  const byRole = new Map(summaries.map((s) => [s.role, s.summary.trim()]));
  const sections = AGENT_ROLES
    .map((role) => {
      const summary = byRole.get(role);
      if (!summary) return null;
      const label = AGENT_ROLE_LABEL[role];
      return `**${label}:**\n${summary}`;
    })
    .filter((s): s is string => s !== null);

  return sections.length > 0 ? sections.join('\n\n') : 'No significant issues found.';
}

type AggregateUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    'rawFindings' | 'analysisSummary' | 'events' | 'error' | 'status'
  >
>;

export function createAggregateFindingsNode(
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType) => Promise<AggregateUpdate> {
  return async (state) => {
    const { reviewRunId } = state;

    const { result, events } = await runPrSteps(reviewRunId, progress, [
      {
        step: 'aggregating_findings',
        graphNode: 'aggregateFindings',
        meta: { rawCount: state.agentFindings.length },
        fn: async () => {
          const rawFindings = deduplicateFindings(state.agentFindings);
          const analysisSummary = buildCombinedSummary(state.agentSummaries);

          return { rawFindings, analysisSummary };
        },
      },
    ]);

    await progress.stepCompleted(reviewRunId, 'aggregating_findings', {
      agentFindingCount: state.agentFindings.length,
      deduplicatedCount: result.rawFindings.length,
      droppedByDedup: state.agentFindings.length - result.rawFindings.length,
    });

    return {
      rawFindings: result.rawFindings,
      analysisSummary: result.analysisSummary,
      events,
    };
  };
}