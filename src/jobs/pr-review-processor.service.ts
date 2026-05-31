import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { TerminalReviewError } from '../graph/pr/errors/terminal-review.error';
import { PrReviewGraphFactory } from '../graph/pr/prreviewgraph.factory';
import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { PrReviewRepository } from '../db/github/pr-review.repository';
import { WebhookDeliveryRepository } from '../db/github/webhook.repository';
import { PrReviewProgressPublisher } from '../streaming/pr-review-progress-publisher.service';
import type { PrReviewStep } from '../streaming/types/pr-review-progress.types';
import { PR_REVIEW_QUEUE } from './constants';
import type { PrReviewJobPayload } from './dtos/pr-review-job.dto';

@Processor(PR_REVIEW_QUEUE)
export class PrReviewProcessorService extends WorkerHost {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly runs: PrReviewRepository,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly installations: GitHubInstallationRepository,
    private readonly progress: PrReviewProgressPublisher,
    private readonly prGraph: PrReviewGraphFactory,
  ) {
    super();
    this.logger = logger.child({ context: PrReviewProcessorService.name });
  }

  async process(job: Job<PrReviewJobPayload>) {
    const className = PrReviewProcessorService.name;
    const methodName = 'process';

    const {
      deliveryId,
      reviewRunId,
      installationId: installationIdStr,
      repoFullName,
      prNumber,
    } = job.data;

    this.logger.info(`[${className}] [${methodName}] :: Starting PR review job`, {
      jobId: String(job.id),
      deliveryId,
      reviewRunId,
      installationId: installationIdStr,
      repoFullName,
      prNumber,
    });

    const installationId = BigInt(installationIdStr);
    let lastStep: PrReviewStep = 'validating';

    const run = await this.runs.findById(reviewRunId);
    if (!run) {
      this.logger.error(`[${className}] [${methodName}] :: PR review run not found`, {
        reviewRunId,
        jobId: String(job.id),
      });
      throw new Error(`PrReview not found: ${reviewRunId}`);
    }

    if (run.githubReviewId != null) {
      this.logger.info(
        `[${className}] [${methodName}] :: Review already posted, skipping`,
        {
          reviewRunId,
          githubReviewId: String(run.githubReviewId),
          deliveryId,
        },
      );
      if (deliveryId) {
        await this.deliveries.markProcessed(deliveryId);
      }
      await this.progress.done(reviewRunId, 'COMPLETED');
      return { skipped: true, githubReviewId: String(run.githubReviewId) };
    }

    try {
      await this.runStep(
        reviewRunId,
        'validating',
        (s) => {
          lastStep = s;
        },
        async () => {
          const installation =
            await this.installations.findById(installationId);
          if (!installation || installation.deletedAt) {
            throw new TerminalReviewError(
              `GitHub installation ${installationIdStr} not found or deleted`,
              'validating',
            );
          }
          if (installation.suspendedAt) {
            throw new TerminalReviewError(
              'GitHub App installation is suspended',
              'validating',
            );
          }
          return installation;
        },
      );

      await this.runs.markRunning(reviewRunId);

      const { summaryMarkdown, githubReviewId } =
        await this.prGraph.invokePrReview(job.data);

      await this.runs.markCompleted(
        reviewRunId,
        summaryMarkdown,
        BigInt(githubReviewId),
      );
      if (deliveryId) {
        await this.deliveries.markProcessed(deliveryId);
      }
      await this.progress.done(reviewRunId, 'COMPLETED');

      this.logger.info(
        `[${className}] [${methodName}] :: PR review job completed`,
        {
          jobId: String(job.id),
          reviewRunId,
          deliveryId,
          githubReviewId,
        },
      );

      return { githubReviewId };
    } catch (err) {
      if (err instanceof TerminalReviewError) {
        await this.failTerminal(reviewRunId, err.step, err.message, deliveryId);
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      this.logger.error(
        `[${className}] [${methodName}] :: PR review job failed`,
        {
          reviewRunId,
          deliveryId,
          jobId: String(job.id),
          isFinalAttempt,
          attemptsMade: job.attemptsMade,
          error: err,
        },
      );

      if (!isFinalAttempt) {
        await this.progress.stepFailed(reviewRunId, lastStep, message, {
          retrying: true,
        });
        throw err;
      }

      await this.runs.markFailed(reviewRunId, message);
      await this.progress.done(reviewRunId, 'FAILED', message);
      if (deliveryId) {
        await this.deliveries.markFailed(deliveryId, message);
      }
      throw err;
    }
  }

  private async runStep<T>(
    reviewRunId: string,
    step: PrReviewStep,
    setLastStep: (step: PrReviewStep) => void,
    fn: () => Promise<T>,
    message?: string,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    setLastStep(step);
    await this.progress.stepStarted(reviewRunId, step, message, meta);
    const result = await fn();
    await this.progress.stepCompleted(reviewRunId, step, meta);
    return result;
  }

  private async failTerminal(
    reviewRunId: string,
    step: PrReviewStep,
    message: string,
    deliveryId?: string,
  ): Promise<void> {
    const className = PrReviewProcessorService.name;
    const methodName = 'failTerminal';

    this.logger.warn(
      `[${className}] [${methodName}] :: Terminal PR review failure`,
      {
        reviewRunId,
        step,
        message,
      },
    );

    await this.progress.stepFailed(reviewRunId, step, message);
    await this.runs.markFailed(reviewRunId, message);
    await this.progress.done(reviewRunId, 'FAILED', message);
    if (deliveryId) {
      await this.deliveries.markFailed(deliveryId, message);
    }
  }
}
