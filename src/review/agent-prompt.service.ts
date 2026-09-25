import { Injectable } from '@nestjs/common';
import type { AgentRole } from './types/agent-prompt.types';
import { PromptRegistryService } from '../prompts/prompt-registry.service';
import type { LlmProviderName } from '../prompts/types/prompt.types';

@Injectable()
export class AgentPromptService {
  constructor(private readonly promptRegistry: PromptRegistryService) {}

  buildSystemPrompt(
    role: AgentRole,
    skipSearchTools: boolean,
    provider?: LlmProviderName,
  ): string {
    const rendered = this.promptRegistry.render(
      'pr-review.specialized',
      { role, skipSearchTools },
      { provider },
    );
    return rendered.systemPrompt;
  }
}
