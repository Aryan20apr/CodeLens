import { MemorySaver } from '@langchain/langgraph';
import type { Logger } from 'winston';

import { PrReviewGraphFactory } from './prreviewgraph.factory';
import { DiffParserService } from '../../diff/diff-parser.service';
import { DiffChunkerService } from '../../diff/diff-chunker.service';
import { DiffChunkSerializerService } from '../../diff/diff-chunk-serializer.service';
import { ValidatePrFindingsService } from '../../review/findings/validator.service';
import type { GithubApiService } from '../../github/github-api.service';
import type { AutonomousReviewAgentFactory } from '../../review/autonomous-review-agent.factory';
import type { PrFileEnrichmentService } from '../../review/enrichment/pr-file-enrichment.service';
import type { PrReviewProgressPublisher } from '../../streaming/pr-review-progress-publisher.service';
import type { PostedFindingRepository } from '../../db/github/posted-finding.repository';
import type { LangGraphCheckpointerService } from '../checkpointer/langgraph-checkpointer.service';
import type { AppConfig } from '../../config/app-config.types';
import type { PrReviewGraphInvokeInput } from './pr-review-graph.types';
import type { UserLlmKey } from '../../llm-provider/llm-provider.service';
import type { LlmService } from '../../llm/llm.service';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));

describe('PrReviewGraph Integration Pipeline (Phase 6)', () => {
  let factory: PrReviewGraphFactory;
  let mockLogger: jest.Mocked<Partial<Logger>>;
  let mockGithub: jest.Mocked<Partial<GithubApiService>>;
  let mockAgentFactory: jest.Mocked<Partial<AutonomousReviewAgentFactory>>;
  let mockEnrichment: jest.Mocked<Partial<PrFileEnrichmentService>>;
  let mockProgress: jest.Mocked<Partial<PrReviewProgressPublisher>>;
  let mockPostedFindings: jest.Mocked<Partial<PostedFindingRepository>>;
  let checkpointer: MemorySaver;
  let mockCheckpointerService: jest.Mocked<
    Partial<LangGraphCheckpointerService>
  >;
  let mockAgentInvoke: jest.Mock;
  let mockAgentCleanup: jest.Mock;
  let mockLlm: jest.Mocked<Partial<LlmService>>;

  const appConfig: AppConfig = {
    env: 'test',
    port: 3000,
    log: { level: 'info', pretty: false },
    langsmith: { tracing: false, apiKey: '', project: '', endpoint: '' },
    redis: { host: 'localhost', port: 6379, password: '', db: 0, queueDb: 1 },
    db: { url: 'postgresql://postgres:postgres@localhost:5432/codelens' },
    auth: {
      jwtAccessSecret: 'sec',
      jwtAccessExpiresIn: '15m',
      jwtRefreshSecret: 'sec',
      jwtRefreshExpiresIn: '7d',
      encryptionKey:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    oauth: {
      github: { clientId: '', clientSecret: '', callbackUrl: '' },
      google: { clientId: '', clientSecret: '', callbackUrl: '' },
    },
    frontend: { url: 'http://localhost:3000' },
    cors: { allowedOrigins: 'http://localhost:3000' },
    llm: {
      googleGenerativeAiApiKey: 'key',
      googleApiKeyFallback: '',
      geminiModel: 'gemini-2.0-flash',
      nvidiaApiKey: 'key',
      nvidiaModel: 'meta/llama-3.1-70b-instruct',
      nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1',
      provider: 'gemini',
    },
    githubApp: {
      appId: '1',
      privateKey: 'pk',
      webhookSecret: 'sec',
      appInstallUrl: '',
    },
    prReview: {
      search: {
        enabled: true,
        maxToolRounds: 3,
        maxQueriesPerRun: 5,
        maxResultsPerQuery: 5,
        maxSnippetChars: 200,
      },
      findings: {
        maxRawFindings: 25,
        maxInlineComments: 10,
        maxPerFile: 5,
        minConfidence: 'low',
        allowedSeverities: ['critical', 'warning', 'info'],
        maxCommentBodyChars: 12000,
        mergeSimilarityThreshold: 0.8,
      },
      incremental: {
        enabled: true,
        skipIfInFlight: false,
      },
    },
  };

  const securityDiff = `diff --git a/src/auth/jwt.strategy.ts b/src/auth/jwt.strategy.ts
index 0000001..0000002 100644
--- a/src/auth/jwt.strategy.ts
+++ b/src/auth/jwt.strategy.ts
@@ -1,5 +1,10 @@
 import { Injectable } from '@nestjs/common';
+export class JwtStrategy {
+  validate(payload: any) {
+    return true; // Vulnerable auth bypass
+  }
+}
`;

  beforeEach(() => {
    checkpointer = new MemorySaver();
    mockCheckpointerService = {
      getSaver: jest.fn().mockReturnValue(checkpointer as any),
    };

    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as any;

    mockGithub = {
      getPullRequest: jest.fn().mockResolvedValue({
        title: 'Fix Authentication Flow',
        body: 'Implements jwt validation',
        headSha: 'head-sha-1234',
        baseSha: 'base-sha-5678',
      }),
      getPullRequestDiff: jest.fn().mockResolvedValue(securityDiff),
      getFileContentAtRef: jest.fn().mockResolvedValue(null),
      getDirectoryAtRef: jest.fn().mockResolvedValue([]),
      createPullRequestReview: jest.fn().mockResolvedValue(990011),
    };

    mockAgentInvoke = jest.fn();
    mockAgentCleanup = jest.fn();

    mockAgentFactory = {
      createAgent: jest.fn().mockImplementation(() => ({
        agent: { invoke: mockAgentInvoke },
        cleanup: mockAgentCleanup,
      })),
    };

    mockEnrichment = {
      enrich: jest.fn().mockResolvedValue({
        contexts: [],
        skippedFiles: [],
      }),
    };

    mockProgress = {
      stepStarted: jest.fn().mockResolvedValue(undefined),
      stepCompleted: jest.fn().mockResolvedValue(undefined),
      stepFailed: jest.fn().mockResolvedValue(undefined),
      done: jest.fn().mockResolvedValue(undefined),
    };

    mockPostedFindings = {
      findFingerprints: jest.fn().mockResolvedValue(new Set()),
      insertMany: jest.fn().mockResolvedValue(undefined),
    };

    const diffParser = new DiffParserService();
    const diffChunker = new DiffChunkerService();
    const diffSerializer = new DiffChunkSerializerService();
    const validator = new ValidatePrFindingsService(
      mockLogger as Logger,
      appConfig,
    );

    mockLlm = {
      getChatModel: jest.fn().mockReturnValue({
        withStructuredOutput: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue({
            summary: 'Review completed',
            findings: [],
          }),
        }),
      }),
    };

    factory = new PrReviewGraphFactory(
      mockLogger as Logger,
      appConfig,
      mockGithub as GithubApiService,
      diffParser,
      diffChunker,
      diffSerializer,
      mockAgentFactory as AutonomousReviewAgentFactory,
      mockEnrichment as PrFileEnrichmentService,
      mockProgress as PrReviewProgressPublisher,
      validator,
      mockCheckpointerService as LangGraphCheckpointerService,
      mockPostedFindings as PostedFindingRepository,
      mockLlm as LlmService,
    );

    factory.onModuleInit();
  });

  it('Scenario 1 (Security Fixture): Autonomous review detects critical auth bypass, validates line in diff, and posts inline review', async () => {
    mockAgentInvoke.mockResolvedValueOnce({
      structuredResponse: {
        summary: 'Critical security issue: JWT validation bypassed.',
        findings: [
          {
            filePath: 'src/auth/jwt.strategy.ts',
            category: 'security',
            severity: 'critical',
            title: 'Hardcoded Auth Bypass',
            description:
              'validate method unconditionally returns true without verifying signature.',
            location: { startLine: 3, endLine: 4 },
            evidenceSnippet: 'return true; // Vulnerable auth bypass',
            suggestedFix: 'Verify token against secret and expiry.',
            confidence: 'high',
          },
        ],
      },
    });

    const input: PrReviewGraphInvokeInput = {
      reviewRunId: 'sec-run-001',
      installationId: '10001',
      repoFullName: 'aryan/codelens',
      prNumber: 42,
      headSha: 'head-sha-1234',
      baseSha: 'base-sha-5678',
    };

    const result = await factory.invokePrReview(input);

    expect(result.githubReviewId).toBe('990011');
    expect(result.summaryMarkdown).toContain(
      'Critical security issue: JWT validation bypassed.',
    );
    expect(result.validatedFindings).toHaveLength(1);
    expect(result.validatedFindings[0]).toMatchObject({
      filePath: 'src/auth/jwt.strategy.ts',
      category: 'security',
      severity: 'critical',
      location: { startLine: 3, endLine: 4 },
    });

    // Verify GitHub review comment creation
    expect(mockGithub.createPullRequestReview).toHaveBeenCalledWith(
      BigInt(10001),
      'aryan/codelens',
      42,
      expect.objectContaining({
        headSha: 'head-sha-1234',
        comments: [
          expect.objectContaining({
            path: 'src/auth/jwt.strategy.ts',
            line: 4,
            start_line: 3,
            side: 'RIGHT',
          }),
        ],
      }),
    );

    expect(mockAgentCleanup).toHaveBeenCalledTimes(1);
  });

  it('Scenario 2 (Incremental Review Fixture): Passes prior findings, flags new regressions, and formats incremental summary', async () => {
    const incrementalDiff = `diff --git a/src/payments/stripe.service.ts b/src/payments/stripe.service.ts
index 0000001..0000002 100644
--- a/src/payments/stripe.service.ts
+++ b/src/payments/stripe.service.ts
@@ -1,5 +1,10 @@
 import Stripe from 'stripe';
+export class StripeService {
+  chargeWithoutIdempotency(amount: number) {
+    return true;
+  }
+}
`;
    mockGithub.getPullRequestDiff = jest
      .fn()
      .mockResolvedValue(incrementalDiff);

    mockAgentInvoke.mockResolvedValueOnce({
      structuredResponse: {
        summary: 'Payment service introduces double-spend risk.',
        findings: [
          {
            filePath: 'src/payments/stripe.service.ts',
            category: 'correctness',
            severity: 'warning',
            title: 'Missing Idempotency Key',
            description:
              'Charge call lacks idempotency key risking duplicate charges.',
            location: { startLine: 2, endLine: 4 },
            evidenceSnippet: 'chargeWithoutIdempotency(amount: number)',
            suggestedFix: 'Provide an idempotencyKey in the request.',
            confidence: 'high',
          },
        ],
      },
    });

    const input: PrReviewGraphInvokeInput = {
      reviewRunId: 'inc-run-002',
      installationId: '10001',
      repoFullName: 'aryan/codelens',
      prNumber: 42,
      headSha: 'head-sha-new',
      baseSha: 'base-sha-old',
      isIncrementalReview: true,
      previousReview: {
        reviewRunId: 'prev-run-001',
        headSha: 'prev-sha-0000',
        baseSha: 'base-sha-old',
        findings: [
          {
            id: 'prev-f-1',
            filePath: 'src/auth/jwt.strategy.ts',
            category: 'security',
            severity: 'critical',
            title: 'Hardcoded Auth Bypass',
            description: 'Bypassed auth',
            location: { startLine: 3, endLine: 4 },
            confidence: 'high',
          },
        ],
      },
    };

    const result = await factory.invokePrReview(input);

    expect(result.githubReviewId).toBe('990011');
    expect(result.validatedFindings).toHaveLength(1);
    expect(result.validatedFindings[0].filePath).toBe(
      'src/payments/stripe.service.ts',
    );

    // Verify agent factory was initialized with incremental options
    expect(mockAgentFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        isIncrementalReview: true,
        previousReviewFindingsCount: 1,
      }),
    );

    // Verify summary contains incremental tracking sections
    expect(result.summaryMarkdown).toContain('What Changed Since Last Review');
    expect(result.summaryMarkdown).toContain('New Findings (1)');
  });

  it('Scenario 3 (Trivial PR Fixture): Documentation change produces zero candidate findings and no inline comments', async () => {
    const docDiff = `diff --git a/README.md b/README.md
index 0000001..0000002 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,5 @@
 # CodeLens
+Fix spelling mistake in documentation.
+Added troubleshooting section.
`;
    mockGithub.getPullRequestDiff = jest.fn().mockResolvedValue(docDiff);

    mockAgentInvoke.mockResolvedValueOnce({
      structuredResponse: {
        summary: 'Documentation updates only. Changes look clean.',
        findings: [],
      },
    });

    const input: PrReviewGraphInvokeInput = {
      reviewRunId: 'triv-run-003',
      installationId: '10001',
      repoFullName: 'aryan/codelens',
      prNumber: 43,
      headSha: 'head-sha-doc',
      baseSha: 'base-sha-doc',
    };

    const result = await factory.invokePrReview(input);

    expect(result.validatedFindings).toHaveLength(0);
    expect(result.summaryMarkdown).toContain('Documentation updates only');

    // GitHub review created with empty comments list
    expect(mockGithub.createPullRequestReview).toHaveBeenCalledWith(
      BigInt(10001),
      'aryan/codelens',
      43,
      expect.objectContaining({
        comments: [],
      }),
    );
  });

  it('Scenario 4 (False-Positive Trap): Drops candidate finding on out-of-bounds/unchanged line before posting to GitHub', async () => {
    mockAgentInvoke.mockResolvedValueOnce({
      structuredResponse: {
        summary: 'Review identified potential issues.',
        findings: [
          {
            filePath: 'src/auth/jwt.strategy.ts',
            category: 'best_practices',
            severity: 'warning',
            title: 'Unchanged Code Hallucination',
            description:
              'Issue reported on line 999 which was not touched in this PR.',
            location: { startLine: 999, endLine: 999 },
            confidence: 'high',
          },
        ],
      },
    });

    const input: PrReviewGraphInvokeInput = {
      reviewRunId: 'fp-run-004',
      installationId: '10001',
      repoFullName: 'aryan/codelens',
      prNumber: 42,
      headSha: 'head-sha-1234',
      baseSha: 'base-sha-5678',
    };

    const result = await factory.invokePrReview(input);

    // The finding on line 999 is outside the diff's added lines, so validator drops it
    expect(result.validatedFindings).toHaveLength(0);
    expect(mockGithub.createPullRequestReview).toHaveBeenCalledWith(
      BigInt(10001),
      'aryan/codelens',
      42,
      expect.objectContaining({
        comments: [],
      }),
    );
  });

  it('Scenario 5 (BYOK Switching): Injects dynamic user keys across Gemini, OpenAI, and Groq', async () => {
    mockAgentInvoke.mockResolvedValue({
      structuredResponse: { summary: 'OK', findings: [] },
    });

    const baseInput: PrReviewGraphInvokeInput = {
      reviewRunId: 'byok-run-005',
      installationId: '10001',
      repoFullName: 'aryan/codelens',
      prNumber: 42,
      headSha: 'head-sha-1234',
      baseSha: 'base-sha-5678',
    };

    const testKeys: UserLlmKey[] = [
      {
        provider: 'GEMINI',
        rawKey: 'test-gemini-key',
        model: 'gemini-1.5-pro',
      },
      { provider: 'OPENAI', rawKey: 'test-openai-key', model: 'gpt-4o' },
      { provider: 'GROQ', rawKey: 'test-groq-key', model: 'llama3-70b-8192' },
    ];

    for (const userLlmKey of testKeys) {
      input_loop: {
        const runId = `byok-${userLlmKey.provider.toLowerCase()}`;
        await factory.invokePrReview(
          { ...baseInput, reviewRunId: runId },
          { userLlmKey },
        );

        expect(mockAgentFactory.createAgent).toHaveBeenCalledWith(
          expect.objectContaining({
            userLlmKey,
          }),
        );
      }
    }
  });

  it('Scenario 6 (Checkpointer Resumption): Resumes from checkpoint on postReview failure without re-running autonomous review', async () => {
    mockAgentInvoke.mockResolvedValueOnce({
      structuredResponse: {
        summary: 'Security issue found.',
        findings: [
          {
            filePath: 'src/auth/jwt.strategy.ts',
            category: 'security',
            severity: 'critical',
            title: 'Hardcoded Auth Bypass',
            description: 'validate method unconditionally returns true.',
            location: { startLine: 3, endLine: 4 },
            confidence: 'high',
          },
        ],
      },
    });

    const threadId = 'retry-thread-001';
    const input: PrReviewGraphInvokeInput = {
      reviewRunId: threadId,
      installationId: '10001',
      repoFullName: 'aryan/codelens',
      prNumber: 42,
      headSha: 'head-sha-1234',
      baseSha: 'base-sha-5678',
    };

    // First attempt: GitHub API fails during postReview
    mockGithub.createPullRequestReview = jest
      .fn()
      .mockRejectedValueOnce(new Error('GitHub API temporary 503'))
      .mockResolvedValueOnce(990099);

    await expect(factory.invokePrReview(input)).rejects.toThrow(
      'GitHub API temporary 503',
    );

    // Confirm that agent was called in attempt 1
    expect(mockAgentInvoke).toHaveBeenCalledTimes(1);

    // Verify checkpoint was persisted
    const savedTuple = await checkpointer.getTuple({
      configurable: { thread_id: threadId },
    });
    expect(savedTuple).toBeDefined();

    // Second attempt: Resume using same reviewRunId
    const resumedResult = await factory.invokePrReview(input);

    expect(resumedResult.githubReviewId).toBe('990099');
    expect(resumedResult.summaryMarkdown).toContain('Security issue found');

    // Critical assertion: mockAgentInvoke was NOT called again on resume!
    expect(mockAgentInvoke).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Invoking PR review graph'),
      expect.objectContaining({
        resuming: true,
      }),
    );
  });
});
