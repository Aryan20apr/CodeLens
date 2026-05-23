import { Inject, Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { PrReviewRunRepository } from '../db/github/pr-review.repository';
import { WebhookDeliveryRepository } from '../db/github/webhook.repository';
import { GithubApiService } from '../github/github-api.service';
import { PrSummaryService } from '../review/pr-summary.service';
import { PR_REVIEW_QUEUE } from './constants';
import type { PrReviewJobPayload } from './dtos/pr-review-job.dto';

@Processor(PR_REVIEW_QUEUE)
export class PrReviewProcessorService extends WorkerHost {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly runs: PrReviewRunRepository,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly installations: GitHubInstallationRepository,
    private readonly github: GithubApiService,
    private readonly summary: PrSummaryService,
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

    const run = await this.runs.findById(reviewRunId);
    if (!run) {
      this.logger.error(`[${className}] [${methodName}] :: PR review run not found`, {
        reviewRunId,
        jobId: String(job.id),
      });
      throw new Error(`PrReviewRun not found: ${reviewRunId}`);
    }

    if (run.githubReviewId != null) {
      this.logger.info(`[${className}] [${methodName}] :: Review already posted, skipping`, {
        reviewRunId,
        githubReviewId: String(run.githubReviewId),
        deliveryId,
      });
      if (deliveryId) {
        await this.deliveries.markProcessed(deliveryId);
      }
      return { skipped: true, githubReviewId: String(run.githubReviewId) };
    }

    const installation = await this.installations.findById(installationId);
    if (!installation || installation.deletedAt) {
      this.logger.error(`[${className}] [${methodName}] :: Installation not found or deleted`, {
        installationId: installationIdStr,
        reviewRunId,
      });
      throw new Error(
        `GitHub installation ${installationIdStr} not found or deleted`,
      );
    }
    if (installation.suspendedAt) {
      this.logger.warn(`[${className}] [${methodName}] :: Installation suspended`, {
        installationId: installationIdStr,
        reviewRunId,
        deliveryId,
      });
      await this.runs.markFailed(reviewRunId, 'GitHub App installation is suspended');
      if (deliveryId) {
        await this.deliveries.markFailed(deliveryId, 'installation suspended');
      }
      throw new Error('GitHub App installation is suspended');
    }

    await this.runs.markRunning(reviewRunId);

    try {
      const pr = await this.github.getPullRequest(
        installationId,
        repoFullName,
        prNumber,
      );
      const diffText = await this.github.getPullRequestDiff(
        installationId,
        repoFullName,
        prNumber,
      );

      const summaryText = await this.summary.summarize({
        repoFullName,
        prNumber,
        title: pr.title ?? `PR #${prNumber}`,
        body: pr.body ?? null,
        diffText,
      });

      const githubReviewId = await this.github.createPullRequestReview(
        installationId,
        repoFullName,
        prNumber,
        summaryText,
      );

      await this.runs.markCompleted(reviewRunId, summaryText, githubReviewId);
      if (deliveryId) {
        await this.deliveries.markProcessed(deliveryId);
      }

      this.logger.info(`[${className}] [${methodName}] :: PR review job completed`, {
        jobId: String(job.id),
        reviewRunId,
        deliveryId,
        githubReviewId: String(githubReviewId),
      });

      return { githubReviewId: String(githubReviewId) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${className}] [${methodName}] :: PR review job failed`, {
        reviewRunId,
        deliveryId,
        jobId: String(job.id),
        error: err,
      });
      await this.runs.markFailed(reviewRunId, message);
      if (deliveryId) {
        await this.deliveries.markFailed(deliveryId, message);
      }
      throw err;
    }
  }
}
