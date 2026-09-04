import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { LlmService } from '../../../llm/llm.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import { extractTextFromLlmContent } from '../../../review/context/llm-content.util';

const SYNTHESIZE_SYSTEM = `You are a senior engineer writing a concise pull-request review summary.
You are given agent analysis summaries and structured findings.
Return ONLY markdown. No JSON. No code fences around the whole response.

Structure your response with these sections (omit any section if not applicable):
## Overview
1-3 sentences describing what this PR does and overall risk level.

## Key Findings
Prioritized bullet list (critical first). Max 7 items. Reference file paths.

## Security / Performance / Best Practices
Only include subsections for categories that have actual findings. Keep each to 1-2 sentences.

## Recommended Next Steps
2-4 bullet points the author should address before merge. Omit if no actionable items.`;

type SynthesizeUpdate = Partial<
  Pick<PrReviewGraphStateType, 'analysisSummary' | 'events' | 'error' | 'status'>
>;

export function createSynthesizeOverviewNode(
  llm: LlmService,
  progress: PrReviewProgressPublisher,
): (state: PrReviewGraphStateType, config?: any) => Promise<SynthesizeUpdate> {
  return async (state, config) => {
    const { reviewRunId } = state;

    const { result: analysisSummary, events } = await runPrSteps(
      reviewRunId,
      progress,
      [
        {
          step: 'synthesizing_overview',
          graphNode: 'synthesizeOverview',
          meta: {
            agentCount: state.agentSummaries.length,
            rawFindingCount: state.rawFindings.length,
          },
          fn: async () => {
            const userLlmKey = config?.configurable?.userLlmKey;
            const model = llm.getChatModel(userLlmKey);

            const agentSummariesText = state.agentSummaries
              .map((s) => `### ${s.role}\n${s.summary.trim()}`)
              .join('\n\n');

            const findingsText = state.rawFindings
              .map(
                (f) =>
                  `- [${f.severity}] ${f.filePath}:${f.location.startLine} — ${f.title} (${f.category})`,
              )
              .join('\n');

            const userContent = [
              `## Agent Summaries\n${agentSummariesText}`,
              `## Findings (${state.rawFindings.length} total)\n${findingsText || '(none)'}`,
            ].join('\n\n');

            const response = await model.invoke([
              new SystemMessage(SYNTHESIZE_SYSTEM),
              new HumanMessage(userContent),
            ]);

            const text = extractTextFromLlmContent(response.content);
            if (!text.trim()) {
              throw new Error('synthesizeOverview: LLM returned empty response');
            }
            return text.trim();
          },
        },
      ],
    );

    await progress.stepCompleted(reviewRunId, 'synthesizing_overview', {
      summaryChars: analysisSummary.length,
    });

    return { analysisSummary, events };
  };
}
