import { createAutonomousReviewNode } from './autonomous-review.node';
import type { AutonomousReviewAgentFactory } from '../../../review/autonomous-review-agent.factory';
import type { DiffChunkSerializerService } from '../../../diff/diff-chunk-serializer.service';
import type { PrReviewProgressPublisher } from '../../../streaming/pr-review-progress-publisher.service';
import type { PrReviewGraphStateType } from '../pr-review.state.annotation';
import type { ReviewChunk } from '../../../diff/types/review-chunk.types';
import type { LlmService } from '../../../llm/llm.service';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));

describe('autonomousReviewNode', () => {
  let mockFactory: jest.Mocked<Partial<AutonomousReviewAgentFactory>>;
  let mockSerializer: jest.Mocked<Partial<DiffChunkSerializerService>>;
  let mockProgress: jest.Mocked<Partial<PrReviewProgressPublisher>>;
  let mockLlm: jest.Mocked<Partial<LlmService>>;
  let mockAgent: { invoke: jest.Mock };
  let mockCleanup: jest.Mock;

  const mockChunk: ReviewChunk = {
    filePath: 'src/auth/auth.service.ts',
    previousPath: null,
    fileStatus: 'modified',
    hunkHeader: '@@ -1,5 +1,20 @@',
    newLineRange: { start: 1, end: 20 },
    addedLines: [
      { line: 1, content: 'export function verifyToken() { return true; }' },
    ],
    deletedLineCount: 0,
  };

  const createBaseState = (): PrReviewGraphStateType => ({
    reviewRunId: 'test-run-123',
    installationId: '123456',
    repoFullName: 'owner/repo',
    prNumber: 42,
    headSha: 'head-sha-abc',
    baseSha: 'base-sha-xyz',
    previousReview: null,
    isIncrementalReview: false,
    prTitle: 'Add Auth Bypass',
    prBody: 'Allows emergency access',
    diffText: '+export function verifyToken() { return true; }',
    diffTruncated: false,
    apiFileIndex: undefined,
    parsed: null,
    chunks: [mockChunk],
    fileIndex: [
      {
        path: 'src/auth/auth.service.ts',
        previousPath: null,
        status: 'modified',
        additions: 15,
        deletions: 0,
      },
    ],
    crossFileHints: [],
    analysisRoute: null,
    selectedAgents: [],
    agentFindings: [],
    agentSummaries: [],
    rawFindings: [],
    analysisSummary: null,
    validatedFindings: [],
    validationStats: null,
    removedOnlyFileCount: 0,
    binaryOrEmptyFileCount: 0,
    fileContexts: [],
    repoRules: 'Always follow zero trust security.',
    repoSkills: [],
    summaryMarkdown: null,
    githubReviewId: null,
    status: 'pending',
    error: null,
    events: [],
  });

  beforeEach(() => {
    mockAgent = {
      invoke: jest.fn().mockResolvedValue({
        structuredResponse: {
          summary: 'Auth vulnerability detected.',
          findings: [
            {
              filePath: 'src/auth/auth.service.ts',
              category: 'security',
              severity: 'critical',
              title: 'Hardcoded Auth Bypass',
              description:
                'verifyToken always returns true without checking JWT.',
              location: { startLine: 1, endLine: 5 },
              evidenceSnippet: 'export function verifyToken() { return true; }',
              suggestedFix: 'Implement proper JWT verification.',
              confidence: 'high',
            },
          ],
        },
      }),
    };

    mockCleanup = jest.fn();

    mockFactory = {
      createAgent: jest.fn().mockReturnValue({
        agent: mockAgent as any,
        cleanup: mockCleanup,
      }),
    };

    mockSerializer = {
      serializeChunks: jest.fn().mockReturnValue({
        text: '### File: src/auth/auth.service.ts\n+export function verifyToken() { return true; }',
      }),
    };

    mockProgress = {
      stepStarted: jest.fn().mockResolvedValue(undefined),
      stepCompleted: jest.fn().mockResolvedValue(undefined),
      stepFailed: jest.fn().mockResolvedValue(undefined),
    };

    mockLlm = {
      getChatModel: jest.fn().mockReturnValue({
        withStructuredOutput: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue({
            summary: 'Auth vulnerability detected.',
            findings: [],
          }),
        }),
      }),
    };
  });

  it('fails gracefully when chunks array is empty', async () => {
    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();
    state.chunks = [];

    const result = await node(state);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Missing chunks for review');
    expect(mockFactory.createAgent).not.toHaveBeenCalled();
  });

  it('invokes agent with structured prompt, publishes progress, and transforms findings', async () => {
    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();
    const config = {
      configurable: {
        userLlmKey: {
          provider: 'OPENAI' as const,
          rawKey: 'sk-test',
          model: 'gpt-4o',
        },
      },
    };

    const update = await node(state, config as any);

    expect(mockFactory.createAgent).toHaveBeenCalledWith({
      userLlmKey: config.configurable.userLlmKey,
      repoRules: 'Always follow zero trust security.',
      repoSkills: [],
      isIncrementalReview: false,
      previousReviewFindingsCount: undefined,
      validFilePaths: ['src/auth/auth.service.ts'],
    });

    expect(mockAgent.invoke).toHaveBeenCalledTimes(1);
    const invokeArgs = mockAgent.invoke.mock.calls[0];
    const userMessageContent = invokeArgs[0].messages[0].content;

    // Verify sections in the formatted prompt
    expect(userMessageContent).toContain('## Pull Request Information');
    expect(userMessageContent).toContain('Add Auth Bypass');
    expect(userMessageContent).toContain('## Changed Files Overview (1 files)');
    expect(userMessageContent).toContain('src/auth/auth.service.ts');
    expect(userMessageContent).toContain('## Diff Chunks');

    // Verify runtime context is passed
    expect(invokeArgs[1].context).toEqual({
      installationId: '123456',
      repoFullName: 'owner/repo',
      headSha: 'head-sha-abc',
      reviewRunId: 'test-run-123',
    });

    // Verify cleanup was invoked
    expect(mockCleanup).toHaveBeenCalledTimes(1);

    // Verify progress tracking was called
    expect(mockProgress.stepStarted).toHaveBeenCalledWith(
      'test-run-123',
      'analyzing_changes',
      undefined,
      expect.objectContaining({ provider: 'OPENAI' }),
    );
    expect(mockProgress.stepCompleted).toHaveBeenCalledWith(
      'test-run-123',
      'analyzing_changes',
      expect.objectContaining({ provider: 'OPENAI' }),
    );

    // Verify mapped output
    expect(update.rawFindings).toHaveLength(1);
    expect(update.rawFindings?.[0]).toMatchObject({
      filePath: 'src/auth/auth.service.ts',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded Auth Bypass',
      confidence: 'high',
    });
    expect(update.rawFindings?.[0].id).toBeDefined();
    expect(update.analysisSummary).toBe('Auth vulnerability detected.');
  });

  it('includes prior review findings in prompt when in incremental review mode', async () => {
    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();
    state.isIncrementalReview = true;
    state.previousReview = {
      reviewRunId: 'prev-run-999',
      headSha: 'prev-sha-12345678',
      baseSha: 'base-sha-000',
      findings: [
        {
          id: 'prev-finding-1',
          filePath: 'src/auth/auth.service.ts',
          category: 'security',
          severity: 'warning',
          title: 'Unchecked Input',
          description: 'Input parameter not validated',
          location: { startLine: 10, endLine: 12 },
          evidenceSnippet: 'const x = req.body;',
          suggestedFix: 'Use Zod validation',
          confidence: 'high',
        },
      ],
    };

    await node(state);

    const invokeArgs = mockAgent.invoke.mock.calls[0];
    const userMessageContent = invokeArgs[0].messages[0].content;

    expect(userMessageContent).toContain(
      '## Prior Review Findings (Commit prev-sh)',
    );
    expect(userMessageContent).toContain(
      '[WARNING] src/auth/auth.service.ts:10: Unchecked Input',
    );
  });

  it('ensures cleanup is called even if agent execution throws', async () => {
    mockAgent.invoke.mockRejectedValueOnce(
      new Error('LLM rate limit exceeded'),
    );

    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();

    await expect(node(state)).rejects.toThrow('LLM rate limit exceeded');
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('Tier 1: parses valid JSON from lead agent final message when structuredResponse is absent', async () => {
    mockAgent.invoke.mockResolvedValueOnce({
      messages: [
        {
          _getType: () => 'ai',
          content: JSON.stringify({
            summary: 'Tier 1 JSON summary',
            findings: [
              {
                filePath: 'src/auth/auth.service.ts',
                category: 'security',
                severity: 'critical',
                title: 'Direct JSON finding',
                description: 'Found in direct json',
                location: { startLine: 1, endLine: 5 },
                confidence: 'high',
              },
            ],
          }),
        },
      ],
    });

    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();
    const update = await node(state);

    expect(update.analysisSummary).toBe('Tier 1 JSON summary');
    expect(update.rawFindings).toHaveLength(1);
    expect(update.rawFindings?.[0].title).toBe('Direct JSON finding');
    expect(update.rawFindings?.[0].filePath).toBe('src/auth/auth.service.ts');
  });

  it('Tier 2: compiles output using compiler when lead agent emits plain markdown and subagents emit candidate findings', async () => {
    mockAgent.invoke.mockResolvedValueOnce({
      messages: [
        {
          _getType: () => 'tool',
          content: JSON.stringify({
            candidateFindings: [
              {
                filePath: 'src/auth/auth.service.ts',
                category: 'security',
                severity: 'warning',
                title: 'Subagent found issue',
                description: 'Issue from investigator',
                location: { startLine: 1, endLine: 5 },
                confidence: 'high',
              },
            ],
          }),
        },
        {
          _getType: () => 'ai',
          content: 'Here is my conversational markdown review without raw JSON.',
        },
      ],
    });

    const mockCompilerInvoke = jest.fn().mockResolvedValue({
      parsed: {
        summary: 'Compiled review summary',
        findings: [
          {
            filePath: 'src/auth/auth.service.ts',
            category: 'security',
            severity: 'warning',
            title: 'Subagent found issue',
            description: 'Issue from investigator',
            location: { startLine: 1, endLine: 5 },
            confidence: 'high',
          },
        ],
      },
      raw: { content: '...' },
    });

    mockLlm.getChatModel = jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: mockCompilerInvoke,
      }),
    });

    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();
    const update = await node(state);

    expect(mockCompilerInvoke).toHaveBeenCalledTimes(1);
    const compilerPrompt = mockCompilerInvoke.mock.calls[0][0];
    const humanMsg = compilerPrompt[1].content;
    expect(humanMsg).toContain('src/auth/auth.service.ts');
    expect(humanMsg).toContain('Subagent Verified Candidate Findings');
    expect(humanMsg).toContain('Subagent found issue');
    expect(update.analysisSummary).toBe('Compiled review summary');
    expect(update.rawFindings).toHaveLength(1);
    expect(update.rawFindings?.[0].filePath).toBe('src/auth/auth.service.ts');
  });

  it('normalizes backslashes and trims whitespace in finding file paths', async () => {
    mockAgent.invoke.mockResolvedValueOnce({
      structuredResponse: {
        summary: 'Path normalization test',
        findings: [
          {
            filePath: '  src\\auth\\auth.service.ts  ',
            category: 'security',
            severity: 'critical',
            title: 'Path test',
            description: 'Checking path normalization',
            location: { startLine: 1, endLine: 5 },
            confidence: 'high',
          },
        ],
      },
    });

    const node = createAutonomousReviewNode(
      mockFactory as AutonomousReviewAgentFactory,
      mockSerializer as DiffChunkSerializerService,
      mockProgress as PrReviewProgressPublisher,
      mockLlm as LlmService,
    );

    const state = createBaseState();
    const update = await node(state);

    expect(update.rawFindings?.[0].filePath).toBe('src/auth/auth.service.ts');
  });
});

