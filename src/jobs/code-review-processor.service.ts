import { Inject, Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GraphFactory } from 'src/graph/graph.factory';
import { CODE_REVIEW_QUEUE } from './constants';
import type { CodeReviewJobPayload } from './dtos/code-review.dto';
import { LanguageDetectService } from 'src/graph/lib/language-detect.service';
import { RedisPubSubService } from 'src/streaming/redis-pub-sub.service';
import { channel } from 'diagnostics_channel';
@Processor(CODE_REVIEW_QUEUE)
export class CodeReviewProcessor extends WorkerHost {
  private readonly logger: Logger;
  private static readonly CLASS = CodeReviewProcessor.name;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly pubSubService: RedisPubSubService,
    private readonly graphFactory: GraphFactory,
  ) {
    super();
    this.logger = logger.child({ context: LanguageDetectService.name });
  }

  async process(job: Job<CodeReviewJobPayload>) {
    const { threadId, source } = job.data;
    const channel = `snippet:${threadId}`
    this.logger.info(
      ` [${CodeReviewProcessor.CLASS}] [process] :: Starting snippet evaluation job=${job.id} threadId=${threadId}`,
    );
    await this.pubSubService.publish(channel, { type: 'job', status: 'starteted', threadId, jobId: job.id })
    // BullMQ progress updates
    await job.updateProgress({ step: 'running-graph', pct: 0.1 });

    const out = await this.graphFactory.invokeSnippet(source, threadId);

    for (const ev of out.events ?? []) {
      await this.pubSubService.publish(channel, { type: 'graph', threadId, event: ev });
    }

    await job.updateProgress({ step: 'graph-complete', pct: 1.0 });

    await this.pubSubService.publish(channel, { type: 'job', status: 'completed', threadId });
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
