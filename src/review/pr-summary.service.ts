import { Inject, Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { LlmService } from '../llm/llm.service';

export type PrSummaryInput = {
  repoFullName: string;
  prNumber: number;
  title: string;
  body: string | null;
  diffText: string;
};

const SYSTEM_PROMPT = `You are CodeLens, a precise pull-request review assistant.
Review ONLY the provided diff and PR metadata. Do not invent files or lines not in the diff.
Output markdown with these sections:
## Overview
## Key changes
## Risks
## Suggested follow-ups
Be concise. No inline line-number comments required in Phase 0.`;

@Injectable()
export class PrSummaryService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly llm: LlmService,
  ) {
    this.logger = logger.child({ context: PrSummaryService.name });
  }

  async summarize(input: PrSummaryInput): Promise<string> {
    const className = PrSummaryService.name;
    const methodName = 'summarize';

    this.logger.info(`[${className}] [${methodName}] :: Generating PR summary`, {
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
      diffChars: input.diffText.length,
      titleChars: input.title.length,
    });

    const model = this.llm.getChatModel();
    const description = (input.body ?? '').slice(0, 8_000);
    const userContent = [
      `Repository: ${input.repoFullName}`,
      `PR #${input.prNumber}`,
      `Title: ${input.title}`,
      description ? `Description:\n${description}` : '',
      `\nDiff:\n${input.diffText}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const response = await model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(userContent),
      ]);

      const text =
        typeof response.content === 'string'
          ? response.content
          : Array.isArray(response.content)
            ? response.content
                .map((c) =>
                  typeof c === 'string'
                    ? c
                    : 'text' in c
                      ? String(c.text)
                      : '',
                )
                .join('')
            : String(response.content ?? '');

      if (!text.trim()) {
        this.logger.error(`[${className}] [${methodName}] :: LLM returned empty PR summary`, {
          repoFullName: input.repoFullName,
          prNumber: input.prNumber,
        });
        throw new Error('LLM returned empty PR summary');
      }

      const summary = text.trim();

      this.logger.info(`[${className}] [${methodName}] :: PR summary generated`, {
        repoFullName: input.repoFullName,
        prNumber: input.prNumber,
        summaryChars: summary.length,
      });

      return summary;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to generate PR summary`, {
        repoFullName: input.repoFullName,
        prNumber: input.prNumber,
        error: err,
      });
      throw err;
    }
  }
}
