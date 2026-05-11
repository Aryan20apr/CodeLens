import type { GraphEvent, SnippetGraphStateType } from "../state.annotation";
import type { FindingCategory, Score, StructuredReport } from "../state.types";

type NodeUpdate = Partial<
  Pick<SnippetGraphStateType, "score" | "report" | "events" | "status" | "error">
>;

const ALL_CATEGORIES: FindingCategory[] = [
  "security",
  "correctness",
  "performance",
  "best_practices",
  "maintainability",
];

function clamp0to100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function createScoreReportNode() {
  return async (state: SnippetGraphStateType): Promise<NodeUpdate> => {
    const now = () => new Date().toISOString();

    const startEvents: GraphEvent[] = [
      {
        node: "score-report",
        status: "started" as const,
        message: "Computing score and building report",
        at: now(),
      },
    ];

    try {
      const analysis = state.llmAnalysis;
      if (!analysis) {
        return {
          status: "failed",
          error: "Missing state.llmAnalysis (run llm-analysis first)",
          events: startEvents.concat([
            {
              node: "score-report",
              status: "failed",
              message: "Missing state.llmAnalysis",
              at: now(),
            },
          ]),
        };
      }

      // Basic deterministic scoring:
      // Start at 100 and subtract penalties per finding severity.
      // Category scores start at 100 and subtract per finding in that category.
      const penalties = {
        critical: 25,
        warning: 10,
        info: 3,
      } as const;

      const categoryScores: Record<FindingCategory, number> = {
        security: 100,
        correctness: 100,
        performance: 100,
        best_practices: 100,
        maintainability: 100,
      };

      let overall = 100;

      for (const f of analysis.findings) {
        const p = penalties[f.severity];
        overall -= p;
        categoryScores[f.category] -= p;
      }

      // Normalize per-category (clamp)
      for (const c of ALL_CATEGORIES) {
        categoryScores[c] = clamp0to100(categoryScores[c]);
      }

      overall = clamp0to100(overall);

      const score: Score = {
        overall,
        categories: categoryScores,
      };

      const report: StructuredReport = {
        summary: analysis.summary,
        score,
        findings: analysis.findings,
        metadata: state.metadata ?? null,
        language: state.language ?? null,
      };

      return {
        score,
        report,
        status: "complete",
        error: null,
        events: startEvents.concat([
          {
            node: "score-report",
            status: "completed",
            message: `Report ready (overall=${score.overall})`,
            at: now(),
          },
        ]),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        status: "failed",

        error: message,
        events: startEvents.concat([
          { node: "score-report", status: "failed", message, at: now() },
        ]),
      };
    }
  };
}