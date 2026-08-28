# CodeLens — AI Code Evaluator & Analyzer

## Project Overview

A platform where developers submit code (paste, upload, or connect a GitHub repo) and receive a comprehensive, AI-powered evaluation covering quality, security, performance, best practices, and actionable suggestions. The platform also acts as a **GitHub PR review bot** — posting inline, LLM-generated code review comments directly on pull requests.

Built as a production-grade portfolio project showcasing LangGraph orchestration, multi-agent design, async job processing, real-time SSE streaming, BYOK (Bring Your Own Key) multi-provider LLM routing, and full-stack TypeScript.

## Constraints

- Solo developer, hobby/portfolio project — not a SaaS launch
- Zero monetary cost — free-tier services, open-source tools, and BYOK for LLM models
- Single NestJS application (no microservices split)
- AI-assisted frontend generation

## Technology Stack

| Layer                | Technology                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| Backend Framework    | NestJS + Fastify adapter                                                |
| Graph Orchestration  | @langchain/langgraph + @langchain/core                                  |
| LLM Providers (BYOK) | Google Gemini, OpenAI, Groq, NVIDIA NIM, Ollama (dynamic per user)     |
| Fallback / Default   | System-configured Gemini or NVIDIA NIM                                  |
| Database             | **PostgreSQL** (chosen; Atlas-free or local Docker)                     |
| ORM / Migrations     | **Prisma** (`prisma/schema.prisma`, `generated/prisma` client)          |
| Job Queue            | BullMQ (`@nestjs/bullmq`)                                               |
| Cache / PubSub       | Redis 7 (Docker)                                                        |
| Code Sandbox         | Docker containers — Phase H, optional                                   |
| AST Parsing          | Tree-sitter via `node-tree-sitter` + language grammars + `.scm` queries |
| Schema Validation    | Zod                                                                     |
| API Docs / Swagger   | OpenAPI 3.0 via `@nestjs/swagger` + Zod-to-OpenAPI schema helpers        |
| Auth                 | `@nestjs/passport` + JWT (access + refresh tokens) + GitHub OAuth       |
| Secret Encryption    | AES-256-GCM (`crypto.util.ts`) for user-stored BYOK API keys            |
| Streaming            | NestJS SSE + Redis PubSub                                               |
| Graph Checkpointer   | Postgres-backed LangGraph checkpointer (`LangGraphCheckpointerService`) |
| Observability        | LangSmith free tier + Winston (`nest-winston`)                          |
| GitHub Integration   | GitHub App (installation tokens) via `GithubApiService` + Octokit       |
| Frontend             | Next.js (App Router) + Tailwind + shadcn/ui *(not yet started)*         |
| Code Editor          | Monaco Editor *(frontend phase)*                                        |
| Charts               | Recharts *(frontend phase)*                                             |
| Data Fetching        | TanStack Query *(frontend phase)*                                       |
| Client State         | Zustand *(frontend phase)*                                              |
| Deployment           | Docker Compose (local) / free-tier VPS                                  |

> **Database choice made:** PostgreSQL with Prisma is used throughout. All schema changes go through `prisma/schema.prisma` and `prisma migrate dev`. The MongoDB sections from the original spec are superseded — there is no Mongoose in this project.

## Architecture

Single NestJS application. API controllers and BullMQ processors run in the same process. Two parallel pipelines exist:

1. **Snippet evaluation pipeline** — code paste / upload → `GraphFactory.invokeSnippet` → LangGraph → score & report
2. **PR review pipeline** — GitHub webhook / manual trigger → BullMQ → `PrReviewGraphFactory.invokePrReview` → LangGraph → inline GitHub review comments

```
Client (Next.js) ──── REST + SSE ────▶ NestJS App
                                         │
                                    ┌────┴──────────────────────┐
                                    │                           │
                              Controllers               BullMQ Processors
                              (API layer)         (code-review + pr-review)
                                    │                           │
                                    ▼                           ▼
                               PostgreSQL              LangGraph Graphs
                               Redis PubSub            Dynamic LLM Engine (BYOK)
                               GitHub API              (Gemini, OpenAI, Groq, NVIDIA)
```

## Actual Project Structure

```
src/
├── app.module.ts
├── main.ts
├── auth/                     — JWT + GitHub OAuth strategies, refresh tokens, installation onboarding
├── bullmq/                   — BullMQ module wiring
├── cls/                      — AsyncLocalStorage / CLS context
├── common/
│   ├── decorators/           — @Public(), @CurrentUser()
│   ├── filters/              — global exception filter (standardized HttpErrorBody)
│   ├── guards/               — JwtAuthGuard, throttle guard
│   ├── interceptors/         — logging, correlation ID
│   ├── interfaces/           — ApiResponse envelope interface
│   ├── pipes/                — Zod validation pipe with clear error messages
│   └── utils/                — crypto (AES-256-GCM), swagger response schemas, zod-to-openapi
├── config/                   — convict-based typed config (AppConfig)
├── db/
│   ├── prisma.service.ts     — PrismaClient wrapper
│   ├── prisma.module.ts
│   └── github/               — PrReviewRepository, GitHubInstallationRepository, ConnectionRepository, WebhookDeliveryRepository
├── diff/
│   ├── diff-parser.service.ts
│   ├── diff-chunker.service.ts
│   ├── diff-chunk-serializer.service.ts
│   └── types/
├── github/
│   ├── github-api.service.ts          — PR diff, file content at ref, compare commits, search/code, post review
│   ├── github-app-auth.service.ts     — installation token issuance
│   ├── github-installation.service.ts
│   └── github-onboarding.service.ts
├── graph/
│   ├── checkpointer/
│   │   └── langgraph-checkpointer.service.ts  — Postgres-backed LangGraph checkpointer
│   ├── lib/
│   │   ├── ast-extract.service.ts    — Tree-sitter AST → CodeMetadata
│   │   ├── language-detect.service.ts
│   │   └── queries/ + tree-sitter/   — .scm query files + grammar bindings
│   ├── nodes/                         — Snippet graph nodes (parse, llm-analysis, score-report, quality-gate, refine-analysis)
│   ├── pr/
│   │   ├── prreviewgraph.factory.ts   — PrReviewGraphFactory, invokePrReview
│   │   ├── pr-review.state.annotation.ts
│   │   ├── pr-review-graph.types.ts
│   │   ├── pr-node-progress.util.ts
│   │   ├── analyze/                   — PrAnalyzeAgentFactory, ReAct analyze subgraph with search tools
│   │   │   ├── analyze-agent.factory.ts
│   │   │   ├── analyze-agent.state.annotation.ts
│   │   │   ├── analyze-routing.util.ts
│   │   │   └── nodes/
│   │   │       ├── analyze-llm.node.ts
│   │   │       └── analyze-finalize.node.ts
│   │   └── nodes/
│   │       ├── diff-ingestion.node.ts      — fetch PR + diff (full or incremental compare)
│   │       ├── chunk.node.ts               — parse + DiffChunkerService → ReviewChunk[]
│   │       ├── enrich-files.node.ts        — AST enrichment via PrFileEnrichmentService
│   │       ├── triage-analysis.node.ts     — LLM triage: simple vs. multi-agent fan-out (Send)
│   │       ├── simple-analyze.node.ts      — single-agent analysis path
│   │       ├── specialized-agent.node.ts   — security / performance / best_practices agents
│   │       ├── aggregate-findings.node.ts  — dedup by (path, line, category), severity merge
│   │       ├── validate-findings.node.ts   — ValidatePrFindingsService, line-ref checks
│   │       └── post-review.node.ts         — createPullRequestReview with inline comments
│   ├── graph.factory.ts               — Snippet GraphFactory (invokeSnippet)
│   ├── graph.module.ts
│   ├── state.annotation.ts            — Snippet graph state
│   └── state.types.ts
├── health/                    — health check endpoint
├── jobs/
│   ├── jobs.module.ts
│   ├── constants.ts
│   ├── code-review-processor.service.ts  — snippet evaluation BullMQ processor (BYOK-aware)
│   ├── code-review-producer.service.ts
│   ├── code-review.controller.ts
│   ├── pr-review-processor.service.ts   — PR review BullMQ processor (BYOK resolution → invokePrReview → persist)
│   └── pr-review-producer.service.ts
├── llm-provider/              — BYOK (Bring Your Own Key) management
│   ├── dto/                   — save-provider-key.dto, set-active-provider.dto
│   ├── llm-provider.controller.ts   — GET/POST/DELETE provider keys, model catalog, active preferences
│   ├── llm-provider.module.ts
│   ├── llm-provider.service.ts      — AES-256-GCM encryption/decryption, user key resolution
│   └── model-fetcher.service.ts     — dynamic model catalog fetching per provider (Gemini, OpenAI, Groq, NVIDIA)
├── llm/
│   └── llm.service.ts         — dynamic ChatModel instantiation based on user BYOK key & preferences, system fallback
├── logger/                    — Winston / nest-winston setup
├── redis/                     — Redis client module
├── repositories/              — User-connected GitHub repository management
├── review/
│   ├── agent-prompt.service.ts         — specialized agent system prompts
│   ├── pr-review-prompt.service.ts     — PR review LLM prompts
│   ├── review.module.ts
│   ├── context/
│   │   ├── global-search-provider.interface.ts
│   │   ├── github-search-provider.service.ts   — GitHub search/code API wrapper
│   │   ├── pr-search-tool-executor.service.ts  — ReAct tool executor (bounded tool loop)
│   │   ├── pr-search-tools.ts                  — LangChain tool defs (search_symbol_usage, search_import_target)
│   │   ├── format-cross-file-hints.util.ts
│   │   └── llm-content.util.ts
│   ├── enrichment/
│   │   ├── pr-file-enrichment.service.ts        — fetch file @ headSha → AST → FileReviewContext[]
│   │   ├── map-added-lines-to-symbols.util.ts
│   │   └── format-file-context.util.ts
│   ├── findings/
│   │   ├── pr-finding.schema.ts       — Finding Zod schema (filePath, line, severity, category, confidence)
│   │   ├── validator.service.ts       — ValidatePrFindingsService (line-ref, severity caps, per-file caps)
│   │   ├── added-line-index.util.ts
│   │   ├── comment-mapper.util.ts     — Finding[] → GitHub review comment coordinates
│   │   └── format-review-body.util.ts
│   └── types/
├── review-runs/
│   ├── review-runs.controller.ts   — GET /review-runs, POST trigger, GET :id, GET :id/stream (SSE)
│   ├── review-runs.service.ts
│   ├── review-runs.module.ts
│   └── dto/
├── streaming/
│   ├── pr-review-progress-publisher.service.ts  — stepStarted/stepCompleted/stepFailed/done → Redis PubSub
│   ├── redis-pub-sub.service.ts
│   ├── event-stream.controller.ts               — Snippet SSE endpoint
│   ├── streaming.module.ts
│   └── types/
│       └── pr-review-progress.types.ts          — PrReviewStep, PrReviewStepEvent, PrReviewDoneEvent
├── types/                     — shared TypeScript types
├── user/                      — user profile, preferences
└── webhook/                   — GitHub webhook endpoint, signature verification, delivery dedup, repo owner userId resolution
```

Frontend lives in `./frontend` as a separate Next.js app *(not yet started)*.

## Coding Standards

### General

- TypeScript strict mode everywhere (`strict: true` in tsconfig)
- Use Zod for all runtime validation (DTOs, configs, LLM responses)
- Prefer `interface` for object shapes, `type` for unions/intersections
- Exhaustive switch handling for all union types and enums
- Keep imports at the top of the file — no inline imports

### NestJS Conventions

- One module per domain concept (auth, user, review, graph, github, jobs, llm-provider, etc.)
- Services contain business logic; controllers are thin REST adapters
- Use constructor injection exclusively — no property injection
- Name files as `<name>.<type>.ts` (e.g., `auth.service.ts`, `pr-finding.schema.ts`)
- DTOs go in a `dto/` subfolder within each module
- Persistence: Prisma entities in `prisma/schema.prisma`; repositories in `src/db/github/`
- Global filters, guards, interceptors, pipes live in `src/common/`
- Custom decorators (`@Public()`, `@CurrentUser()`) live in `src/common/decorators/`
- No `PrReviewJobsModule` — PR review processor lives in `JobsModule`; extend `ReviewModule` / `GraphModule` for domain logic

### Error Handling & Response Envelope

- All successful API endpoints return standard response envelope:
  ```json
  {
    "success": true,
    "message": "Operation description",
    "data": { ... }
  }
  ```
- All HTTP errors are formatted consistently via global `HttpExceptionFilter`:
  ```json
  {
    "success": false,
    "message": "Validation failed / Unauthorized / etc.",
    "data": null,
    "error": "Bad Request",
    "statusCode": 400
  }
  ```
- Use `apiEnvelopeSchema` / `apiArrayEnvelopeSchema` from `common/utils/swagger.util.ts` for Swagger doc responses
- Never leak stack traces or internal details in production
- Use Winston (`nest-winston`) with correlation IDs per request and per BullMQ job

### API Design

- All endpoints under `/api/v1/` prefix
- RESTful naming — plural nouns for resources
- Swagger / OpenAPI documentation on all controllers with explicit request and response schemas
- Pagination via `?page=1&limit=20` (or `?page=1&perPage=20`) query params
- Filter by query params (e.g., `?repoFullName=owner/repo&prNumber=42`)

### BYOK (Bring Your Own Key) & Dynamic LLM Resolution

- Users can register API keys for supported providers: `GEMINI`, `OPENAI`, `GROQ`, `NVIDIA`
- Keys are encrypted at rest using AES-256-GCM via `crypto.util.ts` (`ENCRYPTION_KEY`)
- `ModelFetcherService` dynamically validates keys and queries available models from provider APIs
- Users select an active provider and model stored in `UserPreferences` (`activeProvider`, `activeModel`)
- Dynamic model resolution flow:
  1. Triggering user ID is resolved (from session in manual triggers, or from installation repo connection owner in webhooks)
  2. Processor calls `LlmProviderService.getRawKey(userId)`
  3. Decrypted `UserLlmKey` is passed into LangGraph config: `{ configurable: { userLlmKey } }`
  4. LangGraph nodes (`triageAnalysis`, `simpleAnalyze`, `specializedAgent`, `analyze-agent`, `llmAnalysis`) call `LlmService.getChatModel(userKey)` to instantiate the corresponding LangChain chat model
  5. If no user key is configured, falls back to server-level default (`Gemini` / `NVIDIA NIM`)

### LangGraph

- Graph state is Zod-typed; PR graph state in `graph/pr/pr-review.state.annotation.ts`, snippet in `graph/state.annotation.ts`
- Each node is a standalone file in `graph/pr/nodes/` or `graph/nodes/`
- Edge routers / conditional routing go alongside or in a `routing.util.ts`
- Graph factories compile the `StateGraph` — keep them declarative
- Nodes are pure functions of state in / state out where possible
- LLM calls must use structured output via Zod schemas
- Both graphs use Postgres-backed LangGraph checkpointer (keyed by `reviewRunId` or `evaluationId`)

### LLM Integration

- Dynamic model instantiation via `LlmService.getChatModel(userKey)`
- Supports BYOK Gemini, OpenAI, Groq, NVIDIA NIM, plus system fallbacks
- Use `@langchain/core` abstractions — never call provider APIs directly
- PR prompts live in `review/agent-prompt.service.ts` and `review/pr-review-prompt.service.ts`
- LLM responses must be validated against Zod schemas

### Docker Sandbox

- Security flags are mandatory (when implemented): `--network none`, `--read-only`, `--memory 256m`, `--cpus 0.5`, `--pids-limit 64`, `--security-opt no-new-privileges`, `--tmpfs /tmp:rw,size=64m`
- 30-second execution timeout
- Container must be destroyed after execution regardless of outcome

### Frontend

- Next.js App Router with Tailwind CSS and shadcn/ui components
- TanStack Query for server state, Zustand for client state
- Monaco Editor for code input and annotated code viewing
- SSE for real-time evaluation and review progress
- Pages: login, register, dashboard, evaluate, evaluation detail, evaluations list, GitHub repos, PR review detail, profile, presets, LLM BYOK settings

### Testing

- Unit tests for services, graph nodes, and utility functions
- Integration tests for the full LangGraph pipeline with known code snippets
- E2E tests for critical API flows (submit → process → report / PR webhook → review)

## Key Data Models (Prisma / PostgreSQL)

### User
Fields: `id`, `email`, `name`, `avatarUrl`, `hashedPassword` (nullable for OAuth users), `apiKeyHash` (SHA-256 of raw key, indexed unique), `role` (USER | ADMIN), `oauthAccounts[]`, `refreshTokens[]`, `preferences`, `llmApiKeys[]`, `githubInstallations[]`, `prReviews[]`, `evaluations[]`, `presets[]`, `developerMemory`

### UserPreferences
Fields: `id`, `userId` (unique FK), `defaultLanguage`, `notificationsEnabled`, `activeProvider` (`LlmProvider` enum: `GEMINI` | `OPENAI` | `GROQ` | `NVIDIA`), `activeModel` (string)

### LlmApiKey (BYOK)
Fields: `id`, `userId` (FK), `provider` (`LlmProvider` enum), `encryptedKey` (AES-256-GCM encrypted raw key), `maskedKey` (e.g. `sk-...1234`), `baseUrl` (optional custom endpoint, e.g. for NVIDIA NIM or OpenAI compatible proxies), `createdAt`, `updatedAt`. Unique on `[userId, provider]`.

### GitHubInstallation
Fields: `installationId` (BigInt PK), `accountLogin`, `accountType`, `suspendedAt`, `userId` (FK nullable), `webhookDeliveries[]`, `connections[]`

### Connection (user-connected repo)
Fields: `id`, `installationId`, `repoId`, `repoFullName`, `private`, `connectedAt`, `disconnectedAt`

### WebhookDelivery
Fields: `deliveryId` (PK), `event`, `action`, `installationId`, `repoFullName`, `prNumber`, `headSha`, `baseSha`, `status` (RECEIVED | ENQUEUED | PROCESSED | IGNORED | FAILED), `jobId`, `error`, `receivedAt`, `processedAt`

### PrReview (review run)
Fields: `id`, `deliveryId` (FK nullable, unique), `installationId`, `repoFullName`, `prNumber`, `headSha`, `baseSha`, `status` (PENDING | RUNNING | COMPLETED | FAILED), `triggeredBy` (WEBHOOK | MANUAL), `userId` (FK nullable), `summaryText`, `githubReviewId`, `bullmqJobId`, `error`, `currentStep`, `currentStepMessage`, `createdAt`, `completedAt`

### DeveloperMemory
Fields: `userId`, `acceptedRuleIds[]`, `dismissedRuleIds[]`, `styleSignals` (JSON) — Phase J (future)

### Evaluation / Report / Preset
Stub models in Prisma schema; full schema for snippet evaluation pipeline is a future phase.

## PR Review LangGraph Pipeline (current)

```
START
  → ingestDiff         (fetch PR metadata + diff text)
  → chunk              (DiffParserService + DiffChunkerService → ReviewChunk[])
  → enrichFiles        (PrFileEnrichmentService: fetch file @ headSha → Tree-sitter AST → FileReviewContext[])
  → triageAnalysis     (LLM decides: simple path vs. multi-agent fan-out via LangGraph Send)
  → [simpleAnalyze | securityAgent ‖ perfAgent ‖ bpAgent]
       Each agent runs a ReAct loop with GlobalSearchProvider tools
       (search_symbol_usage, search_import_target via GitHub search/code API)
  → aggregateFindings  (dedup by (path, line, category), merge severity)
  → validateFindings   (ValidatePrFindingsService: drop invalid line refs, severity/count caps)
  → postReview         (createPullRequestReview with inline comments[] + summary body)
END
```

- Each node calls `PrReviewProgressPublisher` (stepStarted / stepCompleted / stepFailed)
- Checkpointer: Postgres-backed; keyed by `reviewRunId` → supports retry/resume
- BYOK support: Injects user's active LLM chat model dynamically into all analysis and agent nodes.

## Snippet Evaluation LangGraph Pipeline

```
START → PARSE CODE → (AST via Tree-sitter) → SANDBOX EXECUTION (add-on, skipped by default)
  → LLM ANALYSIS → SCORE & REPORT → QUALITY GATE
  → (if score < threshold && iteration < max) → REFINE → back to LLM
  → (otherwise) → FINALIZE → END
```

Nodes: `parse`, `llm-analysis`, `score-report`, `quality-gate`, `refine-analysis` (in `graph/nodes/`).
Each node publishes to Redis PubSub channel `eval:{evaluationId}` for SSE streaming.

## SSE Streaming Protocol

### PR Review SSE (`GET /api/v1/review-runs/:id/stream`)

```ts
// Events:
//   snapshot  — full ReviewRunDto (initial DB state on connect)
//   step      — { type, reviewRunId, step, status: 'started'|'completed'|'failed', message?, meta?, retrying?, at }
//   done      — { type, reviewRunId, status: 'COMPLETED'|'FAILED', error?, at }
//
// Meta examples: { fileCount, chunkCount, enrichedFiles, searchQueries, agentType }
// Redis channel: pr-review:{reviewRunId}
```

Connect after `POST /api/v1/review-runs/repositories/:repoId/pull-requests/:prNumber` → `reviewRunId`.

### Snippet SSE (`GET /api/v1/stream/:evaluationId`)

```ts
// Events: status (node, message, progress 0-1), complete (reportId, score), error (message, details)
// Redis channel: eval:{evaluationId}
```

## Implementation Status

### PR Review Path (integrated plan — `pr-review-path-integrated.md`)

| Phase | Name                                     | Status         | Key deliverables                                                                                  |
| ----- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| 0     | PR "Hello PR" — webhook → queue → LLM   | ✅ Done         | `PrReviewProcessorService`, webhook endpoint, delivery dedup, BullMQ job, summary COMMENT review  |
| 1     | Diff parse + chunk + per-file bullets    | ✅ Done         | `DiffParserService`, `DiffChunkerService`, `DiffChunkSerializerService`                           |
| A     | Progress streaming spine                | ✅ Done         | `PrReviewProgressPublisher`, Redis PubSub, SSE endpoint (`/review-runs/:id/stream`)               |
| B     | PR LangGraph skeleton                   | ✅ Done         | `PrReviewGraphFactory`, all graph nodes, `PrReviewGraphState`, processor thinned                  |
| C     | AST + language enrichment               | ✅ Done         | `PrFileEnrichmentService`, `enrich-files.node`, `getFileContentAtRef`, Tree-sitter per file       |
| D     | Global search (GitHub API)              | ✅ Done         | `GlobalSearchProvider`, `GitHubSearchProvider`, `PrSearchToolExecutor`, search tools in analyze   |
| E     | Structured findings + inline comments   | ✅ Done         | `Finding` schema, `ValidatePrFindingsService`, `comment-mapper.util`, inline `postReview` node    |
| F     | Multi-agent analysis + triage           | ✅ Done         | `triageAnalysis` (LLM + LangGraph Send fan-out), `specialized-agent.node`, `aggregateFindings`   |
| G     | Incremental review + dedup              | ✅ Done         | `compareCommits`, `ReviewMode`, dedup-aware review posting                                        |
| H     | Sandbox-backed global search + exec     | ⏳ Not started  | `SandboxModule`, `SandboxSearchProvider`, `sandboxVerify` node — V2, optional                    |
| I     | Rules engine                            | ⏳ Not started  | Rules ingestion, `loadRules` node, `ruleId` on findings                                           |
| J     | Memory + feedback                       | ⏳ Not started  | UI feedback API, `DeveloperMemory` / `RepoMemory` retrieval, optional pgvector RAG                |

### Core Platform Phases (snippet evaluation + foundation + BYOK)

| Phase | Scope                        | Status         | Notes                                                               |
| ----- | ---------------------------- | -------------- | ------------------------------------------------------------------- |
| 0     | Foundation & scaffold        | ✅ Done         | NestJS + Fastify, Prisma, Redis, BullMQ, Auth, config               |
| 1     | Auth & User Management       | ✅ Done         | JWT, refresh tokens, GitHub OAuth, API key (hash stored)            |
| 1.5   | BYOK & Multi-Provider LLM    | ✅ Done         | Encrypted API keys, dynamic model fetch, user preferences, failover |
| 1.6   | Standard API & Swagger Docs  | ✅ Done         | Unified envelope (`ApiResponse<T>`), standardized error filter      |
| 2     | Snippet LangGraph pipeline   | 🔶 Partial     | Graph nodes exist with BYOK; scoring & report DB models are stubs   |
| 3     | Snippet API + SSE + Frontend | ⏳ Not started  | Frontend not yet started; snippet SSE endpoint exists               |
| 4     | GitHub repo integration      | ✅ Done (PR)    | GitHub App auth, repo connection, PR review pipeline complete       |
| 5     | Shareable reports + presets  | ⏳ Not started  | Prisma stubs exist                                                  |
| 6     | Docker sandbox               | ⏳ Not started  | Optional add-on; Phase H in PR plan                                |
| 7     | CLI tool                     | ⏳ Not started  | Add-on                                                              |
| 8     | Documentation & demo         | ⏳ Not started  | Add-on                                                              |

## Plan Files Reference

All plans live in `.agents/plans/`. Key files:

| File | Description |
| ---- | ----------- |
| [`pr-review-path-integrated.md`](.agents/plans/pr-review-path-integrated.md) | **Primary sequencing doc** — Phases A–J, design principles, streaming contract, graph flow |
| [`pr-review-path.md`](.agents/plans/pr-review-path.md) | Original linear Phase 0–8 plan (reference only; integrated plan supersedes for execution order) |
| `phase_g_incremental_dedup_*.plan.md` | Phase G spec (completed) |
| `phase_f_multi_agent_spec.md` | Phase F multi-agent spec (completed) |
| `phase_e_implementation_spec.md` / `phase_e_inline_review_*.plan.md` | Phase E structured findings spec (completed) |
| `phase_b_code_doc_*.plan.md` | Phase B LangGraph skeleton spec (completed) |
| `phase_c_ast_enrichment_*.plan.md` | Phase C AST enrichment spec (completed) |
| `phase_d_global_search_implementation.md` | Phase D global search spec (completed) |
| `phase_a_progress_streaming_*.plan.md` | Phase A streaming spec (completed) |
| `postgres_graph_checkpointing_*.plan.md` | Postgres LangGraph checkpointer spec (completed) |
| `react_analyze_subgraph_*.plan.md` | ReAct analyze subgraph spec (completed as part of D/E/F) |
| `user-connected_repositories_backend_*.plan.md` | Repository connection spec (completed) |
| `code-evaluator-plan-v2.md` / `code-evaluator-plan.md` | Original snippet evaluator design docs |

## Next Phases (H, I, J — all optional / V2)

**Phase H — Sandbox-backed search + execution (V2)**
- Same `GlobalSearchProvider` interface; `SandboxSearchProvider` using ripgrep over cloned workspace
- Optional `sandboxVerify` node for targeted test/typecheck runs
- Feature flag: `SEARCH_PROVIDER=github|sandbox|hybrid`

**Phase I — Rules engine**
- Markdown rules ingestion + tag/file matching
- `loadRules` node before agents; optional `ruleId` on each `Finding`

**Phase J — Memory + feedback**
- UI dismiss/accept feedback API
- `DeveloperMemory` / `RepoMemory` bias prompts
- Optional pgvector `ContextRetrieverNode`

## Important Notes

- **PostgreSQL is the chosen database** — all schema changes go through `prisma/schema.prisma` and `prisma migrate dev`
- **PR review is the primary shipped feature** — Phases 0/1/A–G are all complete; snippet evaluation graph exists but its UI/report pipeline is still a stub
- **BYOK is active** — users can configure API keys for Gemini, OpenAI, Groq, or NVIDIA NIM with custom models and endpoints
- The PR graph supports retry/resume via the Postgres LangGraph checkpointer (keyed by `reviewRunId`)
- `GlobalSearchProvider` is pluggable — `GitHubSearchProvider` is V1; `SandboxSearchProvider` is V2 without graph rewrites
- Do **not** call `GraphFactory.invokeSnippet` from PR jobs — PR uses `PrReviewGraphFactory.invokePrReview` exclusively
- Docker sandbox is an add-on (Phase H) — code execution is not required for PR review quality
