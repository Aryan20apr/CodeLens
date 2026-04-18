# AGENTS.md — CodeLens

Operational guide for AI coding agents working on this repository. Read this before making changes.

---

## 1. Project Snapshot

CodeLens is an AI-powered code review and evaluation platform built on **NestJS + LangGraph**. It accepts code via paste/upload, GitHub repo selection, **or a GitHub/GitLab PR webhook**, and produces a structured, rule-aware, context-aware review with severity-tagged findings.

The system is intentionally a **deterministic + AI hybrid**: deterministic control logic (orchestration, diff chunking, rule selection, validation) wraps a multi-agent LLM pipeline so that output stays scoped, non-generic, and reproducible.

Two planning documents drive the work and **must be kept in sync**:

- `.cursor/plans/ai_code_review_system_architecture_plan.md` — north-star architecture (webhook-driven PR review, rules engine, multi-agent LangGraph, memory, validation).
- `.cursor/plans/code-evaluator-plan.md` — implementation plan (phased delivery, modules, schemas, endpoints). The active version is **V2**, which incorporates the architecture plan.

If those documents disagree, the architecture plan is the design intent and the evaluator plan must be updated to match.

---

## 2. Tech Stack (canonical)

| Layer | Choice |
| --- | --- |
| Backend | NestJS 11 + Fastify adapter, TypeScript strict |
| Orchestration | `@langchain/langgraph` + `@langchain/core` |
| Primary LLM | Google Gemini 2.0 Flash (`@langchain/google-genai`) |
| Fallback LLMs | Groq (`@langchain/groq`) → Ollama (local) |
| Database | MongoDB (Mongoose / `@nestjs/mongoose`) |
| Vector DB | MongoDB Atlas Vector Search (preferred; falls back to local pgvector/Qdrant if needed) |
| Queue | BullMQ (`@nestjs/bullmq`) on Redis 7 |
| Cache / PubSub | Redis 7 |
| Sandbox | Docker (`dockerode`), hardened flags |
| Static Analysis | ESLint, `tsc --noEmit`, Biome, `@typescript-eslint/parser` |
| Validation | Zod (DTOs + LangGraph state + LLM structured output) |
| Auth | `@nestjs/passport` + JWT + GitHub OAuth + API key |
| Streaming | NestJS SSE backed by Redis PubSub |
| Webhooks | NestJS controller with HMAC signature verification (GitHub `X-Hub-Signature-256`, GitLab token) |
| Observability | Pino logger + LangSmith free tier |
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui + Monaco + TanStack Query + Zustand |

Package manager is **pnpm**. Do not introduce npm/yarn lockfiles.

---

## 3. Repository Layout

```
src/
├── app.module.ts
├── main.ts
├── common/                 — filters, interceptors, guards, pipes (Zod), decorators
└── modules/
    ├── auth/               — JWT, GitHub OAuth, API key strategies
    ├── user/
    ├── webhook/            — GitHub/GitLab PR webhook ingress (signature verify, dedup)
    ├── orchestrator/       — deterministic PR processor: normalize, decide full vs incremental
    ├── diff/               — diff parser + chunker (split by file/function, tag controller/service/etc.)
    ├── rules/              — rules engine: ingest .md → parse → normalize → store → tag → retrieve
    ├── memory/             — PR memory, repo memory, developer memory (feedback store)
    ├── vector/             — embeddings + semantic retrieval (context examples)
    ├── evaluation/         — REST + SSE + BullMQ producer/processor (single-snippet path)
    ├── review/             — PR review path (webhook-triggered) producer/processor
    ├── graph/              — LangGraph factory, state, nodes, edges
    │   ├── nodes/          — diff-parser, memory-fetch, context-retriever, rule-injection,
    │   │                      security-agent, performance-agent, best-practices-agent,
    │   │                      aggregator, rule-validator, final-review-generator,
    │   │                      static-analysis, sandbox-execution, score-report, refine
    │   └── edges/          — language-router, quality-gate-router, preset-router
    ├── sandbox/            — Docker lifecycle, hardened flags
    ├── llm/                — provider chain (Gemini → Groq → Ollama), prompt templates
    ├── analysis/           — ESLint, tsc, AST services
    ├── streaming/          — Redis PubSub → SSE
    ├── github/             — Octokit wrapper: repos, tree, PR diff, post comments
    ├── result/             — Result processor: dedup, severity attach, format
    ├── report/
    ├── preset/
    └── health/
```

When you add a module, follow the existing structure: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `schemas/`, `dto/`, plus `producer.ts` / `processor.ts` for queue-backed flows.

Path aliases: `@common/*` → `src/common/*`, `@modules/*` → `src/modules/*` (see `package.json` → `jest.moduleNameMapper` and `tsconfig.json`).

---

## 4. Architectural Invariants (do not violate)

These are the load-bearing rules from the architecture plan. Any change that breaks one of these must be discussed first.

1. **Webhook → Orchestrator → Queue → Worker → LangGraph → Validation → Git/Client.** This is the canonical flow. Never short-circuit it (e.g. don't run LangGraph inline inside an HTTP request).
2. **Deterministic shell, AI core.** Webhook validation, diff chunking, rule selection, rule validation, dedup, and formatting are deterministic. Only the agent nodes are probabilistic.
3. **Selective context injection.** Never dump the full diff or full rule set into a prompt. Always go through the Diff Processor and Rules Engine first. Token budgets are enforced per node.
4. **Chunk before LLM.** LLMs see chunks, not raw diffs. Each chunk carries its own tags (file path, symbol kind: controller/service/repo/util/test).
5. **Rules are structured, not free text.** Markdown is the *source of truth* for humans, but at runtime rules are JSON with `id`, `tags`, `severity`, `description`, `examples`. The ingestion pipeline (parse → normalize → store → index) is the only path to add a rule.
6. **Multi-agent specialization.** Security, Performance, and Best Practices each get their own agent node and their own prompt. Do not collapse them into one prompt unless explicitly directed.
7. **Aggregator + Rule Validator are mandatory post-steps.** Agent outputs go through Aggregator (dedup/merge) then Rule Validator (deterministic check that each finding maps to a known rule or is dropped/flagged).
8. **Memory is read in `MemoryFetchNode` and written in the Result Processor / feedback endpoint.** Nodes do not write to memory directly.
9. **Storage separation.** Vector DB (embeddings), Rules DB (structured rules in Mongo), Memory Store (Mongo collections) are separate concerns. Don't fuse them.
10. **Async only.** Anything that calls an LLM or Docker runs through BullMQ. HTTP handlers return `{ id, status }` and the client streams via SSE.
11. **Sandbox is hardened by default.** Never relax `--network none`, `--read-only`, memory/cpu limits, `--pids-limit`, or `--security-opt no-new-privileges` without explicit sign-off.
12. **LLM provider failover is centralized in `llm.service.ts`.** Don't instantiate provider clients elsewhere.

---

## 5. LangGraph Pipeline (canonical node list)

Two entry shapes share one compiled graph; routing is by `state.source.type`.

**PR review path (webhook):**

```
Diff Parser → Memory Fetch → Context Retriever → Rule Injection
   → [Security Agent | Performance Agent | Best Practices Agent]   (parallel)
   → Aggregator → Rule Validator → Final Review Generator → END
```

**Single-snippet evaluation path (paste/upload/repo file):**

```
Parse → Static Analysis → (Sandbox Execution?) → Memory Fetch → Context Retriever → Rule Injection
   → [Security Agent | Performance Agent | Best Practices Agent]   (parallel)
   → Aggregator → Rule Validator → Score & Report → (Refine?) → Finalize → END
```

State is a single Zod-typed object (see `modules/graph/state.ts`). Add fields rather than creating parallel state objects.

---

## 6. Coding Conventions

- **TypeScript strict** is on. No `any` without a `// eslint-disable-next-line` and a justification comment.
- **Zod everywhere** there's an external boundary: HTTP DTOs, webhook payloads, LangGraph state, LLM structured output, Mongoose document validation when feasible.
- **Imports:** absolute paths via aliases (`@modules/...`, `@common/...`). No deep relative chains (`../../../`). Follow the `no-inline-imports` rule under `.cursor/rules/` if present.
- **Switch exhaustiveness:** when switching on a discriminated union (e.g. `evaluation.source.type`, `severity`, agent kind), include a `default` branch that asserts `never`. See `typescript-exhaustive-switch.mdc`.
- **Comments:** explain *why*, not *what*. Don't narrate the code.
- **Errors:** throw typed exceptions; the global filter formats `{ statusCode, message, error, details }`. Don't return error shapes from services.
- **Logging:** use the Pino logger via Nest's `Logger`. Always include the correlation ID (request ID for HTTP, job ID for workers).
- **Testing:** Jest, files end in `.spec.ts`, colocated with the unit under test. E2E lives under `test/`.

---

## 7. Build / Test / Run

```bash
pnpm install
pnpm run start:dev          # Nest watch mode
pnpm run build
pnpm run lint
pnpm run test               # unit
pnpm run test:e2e
docker compose up -d        # MongoDB + Redis (+ app, +frontend) — see Phase 0 of the evaluator plan
```

Before opening a PR or claiming completion, run at minimum: `pnpm run lint && pnpm run test && pnpm run build`. If you touched LangGraph nodes or the rules pipeline, also run the integration test for that area.

---

## 8. Where to Look First

| You're working on... | Read these first |
| --- | --- |
| Webhook ingestion / signature verify | architecture plan §1.2; `modules/webhook/` |
| PR diff handling | architecture plan §1.5; `modules/diff/` |
| Adding/changing a rule | architecture plan §3; `modules/rules/` (markdown source under `rules/*.md`) |
| LangGraph nodes | architecture plan §2; evaluator plan §LangGraph Pipeline; `modules/graph/` |
| Memory behavior | architecture plan §4; `modules/memory/` |
| Sandbox | evaluator plan Phase 4; `modules/sandbox/` |
| GitHub posting | evaluator plan Phase 5; `modules/github/` |

---

## 9. Definition of Done

A change is done when:

1. The architectural invariants in §4 are still satisfied.
2. `pnpm lint`, `pnpm test`, `pnpm build` are green.
3. New external boundaries have Zod schemas.
4. New LangGraph nodes are wired into the factory and have at least one integration test against a fixture diff/snippet.
5. New rules are registered through the ingestion pipeline (not hardcoded in a prompt).
6. Documentation: if the change affects flow or modules, update `.cursor/plans/code-evaluator-plan.md` (V2) and, if intent shifts, the architecture plan.
