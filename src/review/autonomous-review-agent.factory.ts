import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import {
  createDeepAgent,
  createFilesystemMiddleware,
} from 'deepagents';
import { toolStrategy } from 'langchain';

import { LlmService } from '../llm/llm.service';
import type { UserLlmKey } from '../llm-provider/llm-provider.service';
import { PromptRegistryService } from '../prompts/prompt-registry.service';
import {
  createAutonomousRepoTools,
  PR_SEARCH_TOOL_NAMES,
} from './context/pr-search-tools';
import { PrSearchToolExecutorService } from './context/pr-search-tool-executor.service';
import { PrReviewContextSchema } from './context/pr-review-context.schema';
import {
  CandidateFindingsListSchema,
  createScopedCandidateFindingsListSchema,
  VerificationResultSchema,
} from './findings/autonomous-finding.schema';
import {
  BUILT_IN_SKILLS_DIR,
  createSkillOnlyBackend,
  SAFE_READONLY_FS_TOOLS,
} from './skills/skills.constants';

export interface CreateAutonomousAgentOptions {
  userLlmKey?: UserLlmKey;
  repoRules?: string | null;
  isIncrementalReview?: boolean;
  previousReviewFindingsCount?: number;
  validFilePaths?: string[];
}

export interface AutonomousReviewAgentInstance {
  agent: ReturnType<typeof createDeepAgent>;
  cleanup: () => void;
}

@Injectable()
export class AutonomousReviewAgentFactory {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly promptRegistry: PromptRegistryService,
    private readonly searchExecutor: PrSearchToolExecutorService,
    private readonly llm: LlmService,
  ) {
    this.logger = logger.child({ context: AutonomousReviewAgentFactory.name });
  }

  createAgent(
    options: CreateAutonomousAgentOptions = {},
  ): AutonomousReviewAgentInstance {
    const className = AutonomousReviewAgentFactory.name;
    const methodName = 'createAgent';

    this.logger.info(
      `[${className}] [${methodName}] :: Creating autonomous review agent`,
      {
        hasUserKey: !!options.userLlmKey,
        provider: options.userLlmKey?.provider,
        hasRepoRules: !!options.repoRules,
        isIncrementalReview: options.isIncrementalReview,
      },
    );

    const model = this.llm.getChatModel(options.userLlmKey);

    const backend = createSkillOnlyBackend(BUILT_IN_SKILLS_DIR);
    const skillSources: string[] = ['/skills/'];

    const repoSearchTools = createAutonomousRepoTools(this.searchExecutor);
    const verifierTools = repoSearchTools.filter(
      (t) => t.name === PR_SEARCH_TOOL_NAMES.fileContent,
    );

    const fsMiddleware = createFilesystemMiddleware({
      backend,
      tools: SAFE_READONLY_FS_TOOLS,
      permissions: [
        {
          operations: ['read'],
          paths: ['/skills/**'],
          mode: 'allow',
        },
        {
          operations: ['read', 'write'],
          paths: ['/**'],
          mode: 'deny',
        },
      ],
    });

    const promptOptions = options.userLlmKey?.provider
      ? { provider: options.userLlmKey.provider }
      : undefined;

    const renderedLead = this.promptRegistry.render(
      'pr-review.lead-agent',
      {
        repoRules: options.repoRules,
        isIncrementalReview: options.isIncrementalReview,
        previousReviewFindingsCount: options.previousReviewFindingsCount,
      },
      promptOptions,
    );

    const renderedInvestigator = this.promptRegistry.render(
      'pr-review.investigator',
      { repoRules: options.repoRules },
      promptOptions,
    );

    const renderedVerifier = this.promptRegistry.render(
      'pr-review.verifier',
      {},
      promptOptions,
    );

    const investigatorSubagent = {
      name: 'investigator',
      description:
        'Conducts deep technical investigations into specific files, symbols, or risk areas (security, performance, concurrency, best practices). Equipped with repository search tools and domain skills.',
      mode: 'fork' as const,
      model,
      tools: repoSearchTools,
      middleware: [fsMiddleware],
      systemPrompt: renderedInvestigator.systemPrompt,
      responseFormat: toolStrategy(
        createScopedCandidateFindingsListSchema(options.validFilePaths),
      ),
    };

    const verifierSubagent = {
      name: 'verifier',
      description:
        'Adversarial quality gate that aggressively scrutinizes candidate review findings against the actual repository source code to eliminate false positives and hallucinated lines.',
      mode: 'fork' as const,
      model,
      tools: verifierTools,
      middleware: [fsMiddleware],
      systemPrompt: renderedVerifier.systemPrompt,
      responseFormat: toolStrategy(VerificationResultSchema),
    };

    const agent = createDeepAgent({
      model,
      systemPrompt: renderedLead.systemPrompt,
      contextSchema: PrReviewContextSchema,
      subagents: [investigatorSubagent, verifierSubagent],
      backend,
      skills: skillSources,
      tools: verifierTools,
      middleware: [fsMiddleware],
      permissions: [
        {
          operations: ['read'],
          paths: ['/skills/**'],
          mode: 'allow',
        },
        {
          operations: ['read', 'write'],
          paths: ['/**'],
          mode: 'deny',
        },
      ],
    });

    return {
      agent,
      cleanup: () => {},
    };
  }
}
