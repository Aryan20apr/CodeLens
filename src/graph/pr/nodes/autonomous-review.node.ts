import { randomUUID } from 'crypto';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

import type { AutonomousReviewAgentFactory } from '../../../review/autonomous-review-agent.factory';
import type { DiffChunkSerializerService } from '../../../diff/diff-chunk-serializer.service';
import { formatFileContextsForPrompt } from '../../../review/enrichment/format-file-context.util';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { Finding } from '../../state.types';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import { runPrSteps } from '../pr-node-progress.util';
import type { UserLlmKey } from '../../../llm-provider/llm-provider.service';
import type { LlmService } from '../../../llm/llm.service';
import {
  AutonomousReviewOutputSchema,
  createScopedAutonomousReviewOutputSchema,
} from '../../../review/findings/autonomous-finding.schema';
import { extractJson } from '../../utils/extract-json.util';
import {
  invokeWithStructuredOutput,
  repairJsonWithLlm,
} from '../../utils/structured-output.util';

type AutonomousReviewUpdate = Partial<
  Pick<
    PrReviewGraphStateType,
    | 'rawFindings'
    | 'agentFindings'
    | 'analysisSummary'
    | 'events'
    | 'error'
    | 'status'
  >
>;

function formatAutonomousReviewInput(
  state: PrReviewGraphStateType,
  chunksText: string,
): string {
  const sections: string[] = [];

  if (state.prTitle || state.prBody) {
    sections.push(
      `## Pull Request Information\nTitle: ${state.prTitle ?? '(No title)'}\nDescription:\n${state.prBody ?? '(No description provided)'}`,
    );
  }

  if (state.fileIndex.length > 0) {
    const fileList = state.fileIndex
      .map((f) => `- ${f.path} (${f.status}, +${f.additions} -${f.deletions})`)
      .join('\n');
    sections.push(
      `## Changed Files Overview (${state.fileIndex.length} files)\n${fileList}`,
    );
  }

  if (state.isIncrementalReview && state.previousReview) {
    const prevFindings = state.previousReview.findings
      .map(
        (f) =>
          `- [${f.severity.toUpperCase()}] ${f.filePath}:${f.location.startLine}: ${f.title}`,
      )
      .join('\n');
    sections.push(
      `## Prior Review Findings (Commit ${state.previousReview.headSha.slice(0, 7)})\n${prevFindings || '(No prior findings)'}`,
    );
  }

  const structuralContext = formatFileContextsForPrompt(state.fileContexts);
  sections.push(`## Structural & AST Context\n${structuralContext}`);

  sections.push(`## Diff Chunks\n${chunksText}`);

  sections.push(
    `## Objective\nOrchestrate the review: examine the changes, dispatch parallel investigations using the 'task' tool to 'investigator' for deep domain analysis, verify candidate findings with 'verifier', and provide the final review response.\nIMPORTANT: Always use the exact full relative repository file path for every file (e.g. 'src/path/to/File.java', NOT just bare filenames like 'File.java').`,
  );

  return sections.join('\n\n');
}

export function createAutonomousReviewNode(
  factory: AutonomousReviewAgentFactory,
  serializer: DiffChunkSerializerService,
  progress: PrReviewProgressPublisher,
  llm: LlmService,
): (
  state: PrReviewGraphStateType,
  config?: LangGraphRunnableConfig,
) => Promise<AutonomousReviewUpdate> {
  return async (state, config) => {
    if (state.chunks.length === 0) {
      return {
        status: 'failed',
        error: 'Missing chunks for review',
        events: [
          {
            node: 'autonomousReview',
            status: 'failed',
            message: 'Missing chunks for review',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const { reviewRunId } = state;
    const userLlmKey = config?.configurable?.userLlmKey as
      | UserLlmKey
      | undefined;

    const { result, events } = await runPrSteps(reviewRunId, progress, [
      {
        step: 'analyzing_changes',
        graphNode: 'autonomousReview',
        meta: {
          chunkCount: state.chunks.length,
          fileCount: state.fileIndex.length,
          provider: userLlmKey?.provider ?? 'SYSTEM_FALLBACK',
        },
        fn: async () => {
          const { text: chunksText } = serializer.serializeChunks(state.chunks);
          const userPrompt = formatAutonomousReviewInput(state, chunksText);

          const validFilePaths = (state.fileIndex ?? []).map((f) => f.path);
          const scopedOutputSchema =
            createScopedAutonomousReviewOutputSchema(validFilePaths);

          const { agent, cleanup } = factory.createAgent({
            userLlmKey,
            isIncrementalReview: state.isIncrementalReview,
            previousReviewFindingsCount: state.previousReview?.findings.length,
            validFilePaths,
          });

          try {
            const agentResponse: any = await agent.invoke(
              {
                messages: [new HumanMessage(userPrompt)],
              },
              {
                context: {
                  installationId: String(state.installationId),
                  repoFullName: state.repoFullName,
                  headSha: state.headSha,
                  reviewRunId: state.reviewRunId,
                },
                runName: 'autonomous-pr-review',
                tags: ['pr-review', 'autonomous-runtime'],
              },
            );

            // If structuredResponse was provided (e.g. in mocks/tests), use it directly.
            let structured = agentResponse.structuredResponse;

            if (!structured) {
              const lastMsg =
                agentResponse.messages?.[agentResponse.messages.length - 1];
              const lastText =
                typeof lastMsg?.content === 'string'
                  ? lastMsg.content
                  : JSON.stringify(lastMsg?.content ?? '');

              // Tier 1: If the lead agent returned valid JSON in its final synthesis message
              if (lastText.trim()) {
                try {
                  const jsonStr = extractJson(lastText.trim());
                  structured = scopedOutputSchema.parse(JSON.parse(jsonStr));
                } catch (err) {
                  try {
                    const model = llm.getChatModel(userLlmKey);
                    const repaired = await repairJsonWithLlm(
                      model,
                      scopedOutputSchema,
                      lastText.trim(),
                      err,
                    );
                    structured = repaired.parsed;
                  } catch {
                    structured = null;
                  }
                }
              }

              // Tier 2: If no direct JSON output, compile using invokeWithStructuredOutput
              // with the full repository file index, diff context, subagent candidate findings, and lead assessment
              if (!structured) {
                const subagentFindings: any[] = [];
                for (const msg of agentResponse.messages ?? []) {
                  if (
                    msg instanceof ToolMessage ||
                    msg._getType?.() === 'tool'
                  ) {
                    try {
                      const rawContent =
                        typeof msg.content === 'string'
                          ? msg.content
                          : JSON.stringify(msg.content);
                      const parsed = JSON.parse(extractJson(rawContent));
                      if (Array.isArray(parsed?.candidateFindings)) {
                        subagentFindings.push(...parsed.candidateFindings);
                      }
                    } catch {
                      // ignore non-json tool output
                    }
                  }
                }

                const model = llm.getChatModel(userLlmKey);
                const changedFilesList = state.fileIndex
                  .map(
                    (f) =>
                      `- ${f.path} (${f.status}, +${f.additions} -${f.deletions})`,
                  )
                  .join('\n');

                const finalizePrompt = [
                  new SystemMessage(
                    'You are the final review compiler for CodeLens. Synthesize the lead agent assessment, diff chunks, and subagent findings into the required structured output schema.\n\n' +
                      'CRITICAL RULES:\n' +
                      '1. filePath for every finding MUST be an EXACT relative repository path from the changed files list (e.g. "src/main/java/.../JwtTokenHelper.java", NEVER a bare filename like "JwtTokenHelper.java").\n' +
                      '2. Line numbers MUST cite added lines from the diff chunks (format L{n}). Do not cite deleted or unchanged lines.\n' +
                      '3. summary MUST be a comprehensive Markdown executive summary.',
                  ),
                  new HumanMessage(
                    [
                      `## Changed Files in PR:\n${changedFilesList}`,
                      subagentFindings.length > 0
                        ? `## Subagent Verified Candidate Findings:\n${JSON.stringify(subagentFindings, null, 2)}`
                        : '',
                      `## Lead Agent Final Review Assessment:\n${lastText}`,
                      'Compile the final review summary and verified findings matching the required schema.',
                    ]
                      .filter(Boolean)
                      .join('\n\n'),
                  ),
                ];

                const finalizeResult = await invokeWithStructuredOutput(
                  model,
                  scopedOutputSchema,
                  finalizePrompt,
                  { name: 'compile_autonomous_review' },
                );
                structured = finalizeResult.parsed;
              }
            }

            const summary = structured?.summary ?? 'Review completed.';
            const rawFindingsList = structured?.findings ?? [];
            const findingsWithIds: Finding[] = rawFindingsList.map(
              (f: any): Finding => ({
                id: randomUUID(),
                filePath:
                  typeof f.filePath === 'string'
                    ? f.filePath.replace(/\\/g, '/').trim()
                    : f.filePath,
                category: f.category,
                severity: f.severity,
                title: f.title,
                description: f.description,
                location: {
                  startLine: f.location.startLine,
                  endLine: f.location.endLine,
                },
                evidenceSnippet: f.evidenceSnippet,
                suggestedFix: f.suggestedFix,
                confidence: f.confidence,
              }),
            );

            return {
              summary:
                typeof summary === 'string' ? summary : JSON.stringify(summary),
              findings: findingsWithIds,
            };
          } finally {
            cleanup();
          }
        },
      },
    ]);

    return {
      rawFindings: result.findings,
      agentFindings: result.findings,
      analysisSummary: result.summary,
      events,
    };
  };
}
