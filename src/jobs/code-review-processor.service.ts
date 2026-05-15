import { Inject, Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GraphFactory } from 'src/graph/graph.factory';
import { CODE_REVIEW_QUEUE } from './constants';
import type { CodeReviewJobPayload } from './dtos/code-review.dto';
import { LanguageDetectService } from 'src/graph/lib/language-detect.service';

@Processor(CODE_REVIEW_QUEUE)
export class CodeReviewProcessor extends WorkerHost {
  private readonly logger: Logger;
  private static readonly CLASS = CodeReviewProcessor.name;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly graphFactory: GraphFactory,
  ) {
    super();
    this.logger = logger.child({ context: LanguageDetectService.name });
  }

  async process(job: Job<CodeReviewJobPayload>) {
    const { threadId, source } = job.data;

    this.logger.info(
      ` [${CodeReviewProcessor.CLASS}] [process] :: Starting snippet evaluation job=${job.id} threadId=${threadId}`,
    );

    // BullMQ progress updates
    await job.updateProgress({ step: 'running-graph', pct: 0.1 });

    const out = await this.graphFactory.invokeSnippet(source, threadId);

    await job.updateProgress({ step: 'graph-complete', pct: 1.0 });

    // (BullMQ stores it in job.returnvalue; can be fetched by jobId)
    return {
      threadId,
      status: out.status,
      error: out.error,
      report: out.report,
      score: out.score,
      events: out.events,
    };
  }
}
