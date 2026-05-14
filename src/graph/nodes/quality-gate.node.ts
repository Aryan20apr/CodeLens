import type { GraphEvent, SnippetGraphStateType } from '../state.annotation';

type NodeUpdate = Partial<
  Pick<
    SnippetGraphStateType,
    'qualityGatePassed' | 'events' | 'status'
  >
>;

export function createQualityGateNode() {
  return async (
    state: SnippetGraphStateType,
  ): Promise<NodeUpdate> => {
    const now = () => new Date().toISOString();

    const analysis = state.llmAnalysis;

    if (!analysis) {
      return {
        qualityGatePassed: false,
        status: 'failed',
        events: [
          {
            node: 'quality-gate',
            status: 'failed',
            message: 'Missing llmAnalysis',
            at: now(),
          },
        ],
      };
    }

    /**
     * Very simple first-pass gate:
     * - reject if all findings are low confidence
     * - reject if no findings
     */

    const findings = analysis.findings;

    const passed =
      findings.length > 0 &&
      findings.some((f) => f.confidence !== 'low');

    return {
      qualityGatePassed: passed,
      status: 'complete',
      events: [
        {
          node: 'quality-gate',
          status: 'completed',
          message: passed
            ? 'Quality gate passed'
            : 'Quality gate failed',
          at: now(),
        },
      ],
    };
  };
}