import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { PR_REVIEW_JOB, PR_REVIEW_QUEUE } from './constants';
import type { PrReviewJobPayload } from './dtos/pr-review-job.dto';

@Injectable()
export class PrReviewProducerService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @InjectQueue(PR_REVIEW_QUEUE)
    private readonly queue: Queue<PrReviewJobPayload>,
  ) {
    this.logger = logger.child({ context: PrReviewProducerService.name });
  }

  async enqueue(payload: PrReviewJobPayload) {
    const className = PrReviewProducerService.name;
    const methodName = 'enqueue';

    this.logger.info(`[${className}] [${methodName}] :: Enqueueing PR review job`, {
      deliveryId: payload.deliveryId,
      reviewRunId: payload.reviewRunId,
      installationId: payload.installationId,
      repoFullName: payload.repoFullName,
      prNumber: payload.prNumber,
    });

    try {
      const job = await this.queue.add(PR_REVIEW_JOB, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnFail: false,
      });

      const jobId = String(job.id);

      this.logger.info(`[${className}] [${methodName}] :: PR review job enqueued`, {
        deliveryId: payload.deliveryId,
        reviewRunId: payload.reviewRunId,
        jobId,
      });

      return { jobId };
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to enqueue PR review job`, {
        deliveryId: payload.deliveryId,
        reviewRunId: payload.reviewRunId,
        error: err,
      });
      throw err;
    }
  }
}
