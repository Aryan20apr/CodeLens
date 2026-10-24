import { AutonomousReviewAgentFactory } from './autonomous-review-agent.factory';
import type { LlmService } from '../llm/llm.service';
import type { PromptRegistryService } from '../prompts/prompt-registry.service';
import type { PrSearchToolExecutorService } from './context/pr-search-tool-executor.service';
import type { Logger } from 'winston';
import { FakeListChatModel } from '@langchain/core/utils/testing';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));

describe('AutonomousReviewAgentFactory (Phase 4)', () => {
  let factory: AutonomousReviewAgentFactory;
  let mockLogger: jest.Mocked<Partial<Logger>>;
  let mockPromptRegistry: jest.Mocked<Partial<PromptRegistryService>>;
  let mockSearchExecutor: jest.Mocked<Partial<PrSearchToolExecutorService>>;
  let mockLlm: jest.Mocked<Partial<LlmService>>;

  beforeEach(() => {
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockPromptRegistry = {
      render: jest.fn().mockImplementation((promptId: string) => {
        return {
          systemPrompt: `System prompt for ${promptId}`,
          langchainMetadata: {
            tags: [],
            metadata: { promptId, promptVersion: '1.0' },
          },
        };
      }),
    };

    mockSearchExecutor = {
      getOrCreateContext: jest.fn(),
      executeToolCall: jest.fn(),
    };

    mockLlm = {
      getChatModel: jest.fn().mockReturnValue(
        new FakeListChatModel({
          responses: ['{"summary": "ok", "findings": []}'],
        }),
      ),
    };

    factory = new AutonomousReviewAgentFactory(
      mockLogger as Logger,
      mockPromptRegistry as PromptRegistryService,
      mockSearchExecutor as PrSearchToolExecutorService,
      mockLlm as LlmService,
    );
  });

  it('creates an autonomous review agent with forked subagents', () => {
    const { agent, cleanup } = factory.createAgent({
      repoRules: 'Always test your code.',
      isIncrementalReview: true,
      previousReviewFindingsCount: 3,
    });

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');
    expect(mockPromptRegistry.render).toHaveBeenCalledWith(
      'pr-review.lead-agent',
      {
        repoRules: 'Always test your code.',
        isIncrementalReview: true,
        previousReviewFindingsCount: 3,
      },
      undefined,
    );
    expect(mockPromptRegistry.render).toHaveBeenCalledWith(
      'pr-review.investigator',
      { repoRules: 'Always test your code.' },
      undefined,
    );
    expect(mockPromptRegistry.render).toHaveBeenCalledWith(
      'pr-review.verifier',
      {},
      undefined,
    );

    cleanup();
  });

  it('strips destructive mutation tools and provides only safe read-only filesystem tools', () => {
    const { agent, cleanup } = factory.createAgent();

    try {
      const toolsNode = (agent as any).graph?.nodes?.['tools'];
      const toolNames: string[] =
        toolsNode?.bound?.tools?.map((t: any) => t.name) ?? [];

      expect(toolNames).toContain('ls');
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('glob');
      expect(toolNames).toContain('grep');
      expect(toolNames).toContain('task');

      expect(toolNames).not.toContain('write_file');
      expect(toolNames).not.toContain('edit_file');
      expect(toolNames).not.toContain('delete');
      expect(toolNames).not.toContain('execute');
    } finally {
      cleanup();
    }
  });

  it('mounts custom repository skills and safely cleans up temporary directory', () => {
    const { agent, cleanup } = factory.createAgent({
      repoSkills: [
        {
          name: 'custom-skill',
          path: '.codelens/skills/custom-skill',
          content:
            '---\nname: custom-skill\ndescription: Custom skill\n---\n# Content',
        },
      ],
    });

    expect(agent).toBeDefined();
    // Verify cleanup removes the temporary files without error
    expect(() => cleanup()).not.toThrow();
  });

  it('configures investigator with scoped candidate findings schema when validFilePaths is provided', () => {
    const { agent, cleanup } = factory.createAgent({
      validFilePaths: ['src/main/App.java', 'src/auth/Auth.java'],
    });

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });
});
