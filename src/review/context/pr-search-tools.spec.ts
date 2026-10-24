import {
  createAutonomousRepoTools,
  PR_SEARCH_TOOL_NAMES,
} from './pr-search-tools';
import type { PrSearchToolExecutorService } from './pr-search-tool-executor.service';

describe('createAutonomousRepoTools (Phase 3)', () => {
  let mockExecutor: jest.Mocked<Partial<PrSearchToolExecutorService>>;
  let tools: ReturnType<typeof createAutonomousRepoTools>;

  beforeEach(() => {
    mockExecutor = {
      getOrCreateContext: jest.fn().mockReturnValue({
        installationId: 12345n,
        repoFullName: 'owner/test-repo',
        headSha: 'abc1234',
        queriesUsed: 0,
        fileContentFetched: 0,
        cache: new Map(),
      }),
      executeToolCall: jest
        .fn()
        .mockImplementation(async (_ctx, toolName, args) => {
          if (toolName === PR_SEARCH_TOOL_NAMES.symbolUsage) {
            return {
              hint: null,
              toolMessage: `Found usages of ${(args as any).symbol}`,
            };
          }
          if (toolName === PR_SEARCH_TOOL_NAMES.importTarget) {
            return {
              hint: null,
              toolMessage: `Found importers of ${(args as any).modulePath}`,
            };
          }
          if (toolName === PR_SEARCH_TOOL_NAMES.fileContent) {
            return {
              hint: null,
              toolMessage: `Content of ${(args as any).filePath}`,
            };
          }
          return { hint: null, toolMessage: 'Unknown tool' };
        }),
    };

    tools = createAutonomousRepoTools(
      mockExecutor as PrSearchToolExecutorService,
    );
  });

  it('creates all 3 repository tools with expected names and schemas', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain(PR_SEARCH_TOOL_NAMES.symbolUsage);
    expect(names).toContain(PR_SEARCH_TOOL_NAMES.importTarget);
    expect(names).toContain(PR_SEARCH_TOOL_NAMES.fileContent);
  });

  it('search_symbol_usage retrieves repository coordinates from runtime.context', async () => {
    const symbolTool = tools.find(
      (t) => t.name === PR_SEARCH_TOOL_NAMES.symbolUsage,
    )!;

    const runtimeMock = {
      context: {
        installationId: '12345',
        repoFullName: 'owner/test-repo',
        headSha: 'abc1234',
        reviewRunId: 'run-999',
      },
    };

    const result = await (symbolTool as any).invoke(
      { symbol: 'authenticateUser' },
      runtimeMock,
    );

    expect(result).toBe('Found usages of authenticateUser');
    expect(mockExecutor.getOrCreateContext).toHaveBeenCalledWith(
      'run-999',
      12345n,
      'owner/test-repo',
      'abc1234',
    );
    expect(mockExecutor.executeToolCall).toHaveBeenCalledWith(
      expect.anything(),
      PR_SEARCH_TOOL_NAMES.symbolUsage,
      { symbol: 'authenticateUser' },
    );
  });

  it('search_import_target retrieves coordinates from runtime.context', async () => {
    const importTool = tools.find(
      (t) => t.name === PR_SEARCH_TOOL_NAMES.importTarget,
    )!;

    const runtimeMock = {
      context: {
        installationId: '12345',
        repoFullName: 'owner/test-repo',
        headSha: 'abc1234',
        reviewRunId: 'run-999',
      },
    };

    const result = await (importTool as any).invoke(
      { modulePath: 'src/auth' },
      runtimeMock,
    );

    expect(result).toBe('Found importers of src/auth');
    expect(mockExecutor.getOrCreateContext).toHaveBeenCalledWith(
      'run-999',
      12345n,
      'owner/test-repo',
      'abc1234',
    );
  });

  it('get_file_content_at_sha retrieves coordinates from runtime.context', async () => {
    const fileTool = tools.find(
      (t) => t.name === PR_SEARCH_TOOL_NAMES.fileContent,
    )!;

    const runtimeMock = {
      context: {
        installationId: '12345',
        repoFullName: 'owner/test-repo',
        headSha: 'abc1234',
        reviewRunId: 'run-999',
      },
    };

    const result = await (fileTool as any).invoke(
      { filePath: 'src/auth/auth.service.ts' },
      runtimeMock,
    );

    expect(result).toBe('Content of src/auth/auth.service.ts');
    expect(mockExecutor.getOrCreateContext).toHaveBeenCalledWith(
      'run-999',
      12345n,
      'owner/test-repo',
      'abc1234',
    );
  });

  it('falls back gracefully when runtime context is missing', async () => {
    const symbolTool = tools.find(
      (t) => t.name === PR_SEARCH_TOOL_NAMES.symbolUsage,
    )!;

    const result = await (symbolTool as any).invoke(
      { symbol: 'missingContext' },
      {},
    );

    expect(result).toContain('Repository context');
    expect(mockExecutor.executeToolCall).not.toHaveBeenCalled();
  });
});
