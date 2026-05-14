import { z } from 'zod';
import { randomUUID } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import type { LlmService } from 'src/llm/llm.service';
import type { GraphEvent, SnippetGraphStateType } from '../state.annotation';
import type { LlmAnalysis } from '../state.types';
import { parseLlmAnalysis } from "../utils/parse-llm-analysis.util";

const FindingSchema = z.object({
  category: z.enum([
    'security',
    'correctness',
    'performance',
    'best_practices',
    'maintainability',
  ]),
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().min(3),
  description: z.string().min(10),
  location: z.object({
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
  }),
  evidenceSnippet: z.string().optional(),
  suggestedFix: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});

const LlmAnalysisSchema = z.object({
  summary: z.string().min(10),
  findings: z.array(FindingSchema).max(25),
});

type LlmAnalysisOut = z.infer<typeof LlmAnalysisSchema>;
type NodeUpdate = Partial<
  Pick<SnippetGraphStateType, 'status' | 'error' | 'events' | 'llmAnalysis'>
>;

export function createLlmAnalysisNode(llm: LlmService) {
    return async (state: SnippetGraphStateType): Promise<NodeUpdate> => {
        const now = () => new Date().toISOString();

        if (!state.source) {
            return {
              status: "failed",
              error: "Missing state.source",
              events: [
                {
                  node: "llm-analysis",
                  status: "failed",
                  message: "Missing state.source",
                  at: now(),
                },
              ],
            };
          }
          const language = state.language ?? state.source.language ?? "unknown";
          const code = state.source.code;
          const metadata = state.metadata;
      
          const startEvents: GraphEvent[] = [
            {
              node: "llm-analysis",
              status: "started",
              message: "Running LLM analysis",
              at: now(),
            },
          ];
      
          try {
            const chat = llm.getChatModel();
      
            const system = new SystemMessage(
              [
                "You are CodeLens, a precise code review assistant.",
                "Return ONLY valid JSON. No markdown. No code fences.",
                "You MUST be grounded in the provided snippet. Do not invent files, functions, or dependencies.",
                "",
                "Task:",
                "Analyze the snippet and produce a compact structured review.",
                "",
                "Hard requirements:",
                "- findings[].location must be within snippet line numbers.",
                "- If uncertain, set confidence='low'.",
                "- Evidence must quote exact snippet text when possible.",
                "- Keep findings <= 25 and focus on highest impact.",
                "",
                "JSON schema:",
                `{
        "summary": string,
        "findings": [{
          "category": "security"|"correctness"|"performance"|"best_practices"|"maintainability",
          "severity": "critical"|"warning"|"info",
          "title": string,
          "description": string,
          "location": { "startLine": number, "endLine": number },
          "evidenceSnippet"?: string,
          "suggestedFix"?: string,
          "confidence": "high"|"medium"|"low"
        }]
      }`,
              ].join("\n"),
            );
      
            const human = new HumanMessage(
              [
                `Language: ${language}`,
                "",
                "Metadata (may be null):",
                JSON.stringify(metadata ?? null),
                "",
                "Snippet (line numbers start at 1):",
                code,
              ].join("\n"),
            );
      
            const res = await chat.invoke([system, human]);
      
            const raw =
              typeof res.content === "string"
                ? res.content
                : JSON.stringify(res.content);
            console.log("Raw response: "+raw);
            // Strict JSON parse + validate
            const llmAnalysis = parseLlmAnalysis(raw);
      
            return {
              llmAnalysis,
              status: "complete",
              error: null,
              events: startEvents.concat([
                {
                  node: "llm-analysis",
                  status: "completed",
                  message: `LLM analysis produced ${llmAnalysis.findings.length} findings`,
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
                { node: "llm-analysis", status: "failed", message, at: now() },
              ]),
            };
          }
        };
      }