import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type {
  LlmProviderName,
  PromptDefinition,
  PromptId,
  PromptMetadata,
  RenderedPrompt,
} from './types/prompt.types';
import { PROMPT_CATALOG } from './catalog';

@Injectable()
export class PromptRegistryService {
  private readonly logger: Logger;
  private readonly catalog = new Map<string, PromptDefinition>();

  constructor(@Inject(WINSTON_MODULE_PROVIDER) logger: Logger) {
    this.logger = logger.child({ context: PromptRegistryService.name });
    for (const prompt of PROMPT_CATALOG) {
      this.catalog.set(`${prompt.id}@${prompt.version}`, prompt);
    }
  }

  get<T = any>(id: PromptId, version?: string): PromptDefinition<T> {
    if (version) {
      const match = this.catalog.get(`${id}@${version}`);
      if (!match) {
        throw new Error(`Prompt with id '${id}' and version '${version}' not found`);
      }
      return match as PromptDefinition<T>;
    }

    // Default to the highest registered semver version for this id
    const matches = Array.from(this.catalog.values()).filter((p) => p.id === id);
    if (matches.length === 0) {
      throw new Error(`Prompt with id '${id}' not found`);
    }

    matches.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    return matches[0] as PromptDefinition<T>;
  }

  render<T>(
    id: PromptId,
    variables: T,
    options?: { version?: string; provider?: LlmProviderName },
  ): RenderedPrompt {
    const prompt = this.get<T>(id, options?.version);
    const provider = options?.provider;

    let renderedResult: { systemPrompt: string; userPrompt?: string };

    if (provider && prompt.providerOverrides?.[provider]) {
      renderedResult = prompt.providerOverrides[provider]!(variables);
    } else {
      renderedResult = prompt.render(variables, provider);
    }

    const tags = [
      `prompt:${prompt.id}`,
      `v:${prompt.version}`,
      ...(provider ? [`provider:${provider}`] : []),
    ];

    return {
      systemPrompt: renderedResult.systemPrompt,
      userPrompt: renderedResult.userPrompt,
      metadata: {
        id: prompt.id,
        version: prompt.version,
        description: prompt.description,
        tags: prompt.tags,
      },
      langchainMetadata: {
        tags,
        metadata: {
          promptId: prompt.id,
          promptVersion: prompt.version,
          provider,
        },
      },
    };
  }

  list(): PromptMetadata[] {
    return Array.from(this.catalog.values()).map((p) => ({
      id: p.id,
      version: p.version,
      description: p.description,
      tags: p.tags,
    }));
  }
}
