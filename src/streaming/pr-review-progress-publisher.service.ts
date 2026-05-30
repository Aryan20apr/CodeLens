import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { PrReviewRepository } from '../db/github/pr-review.repository';
import { RedisPubSubService } from './redis-pub-sub.service';
import {
  prReviewChannel,
  type PrReviewDoneEvent,
  type PrReviewStep,
  type PrReviewStepEvent,
} from './types/pr-review-progress.types';

@Injectable()
export class PrReviewProgressPublisher {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly pubsub: RedisPubSubService,
    private readonly runs: PrReviewRepository,
  ) {
    this.logger = logger.child({ context: PrReviewProgressPublisher.name });
  }

  async stepStarted(
    reviewRunId: string,
    step: PrReviewStep,
    message?: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.runs.updateCurrentStep(reviewRunId, {
      currentStep: step,
      currentStepMessage: message ?? null,
    });
    await this.publishStep({
      reviewRunId,
      step,
      status: 'started',
      message,
      meta,
    });
  }

  async stepCompleted(
    reviewRunId: string,
    step: PrReviewStep,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.publishStep({
      reviewRunId,
      step,
      status: 'completed',
      meta,
    });
  }

  async stepFailed(
    reviewRunId: string,
    step: PrReviewStep,
    message: string,
    options?: { retrying?: boolean },
  ): Promise<void> {
    await this.publishStep({
      reviewRunId,
      step,
      status: 'failed',
      message,
      retrying: options?.retrying,
    });
  }

  async done(
    reviewRunId: string,
    status: 'COMPLETED' | 'FAILED',
    error?: string,
  ): Promise<void> {
    const payload: PrReviewDoneEvent = {
      type: 'done',
      reviewRunId,
      status,
      error,
      at: new Date().toISOString(),
    };
    await this.pubsub.publish(prReviewChannel(reviewRunId), payload);
    this.logger.info(
      `[${PrReviewProgressPublisher.name}] [done] :: Published terminal progress`,
      { reviewRunId, status },
    );
  }

  private async publishStep(
    input: Omit<PrReviewStepEvent, 'type' | 'at'>,
  ): Promise<void> {
    const payload: PrReviewStepEvent = {
      type: 'step',
      ...input,
      at: new Date().toISOString(),
    };
    await this.pubsub.publish(prReviewChannel(input.reviewRunId), payload);
  }
}
