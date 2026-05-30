import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { PrReviewRepository } from '../db/github/pr-review.repository';
import { WebhookDeliveryRepository } from '../db/github/webhook.repository';
import { DiffChunkerService } from '../diff/diff-chunker.service';
import { DiffParserService } from '../diff/diff-parser.service';
import type { FileIndexEntry } from '../diff/types/review-chunk.types';
import { GithubApiService, MAX_DIFF_CHARS } from '../github/github-api.service';
import { PrSummaryService } from '../review/pr-summary.service';
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
    private readonly github: GithubApiService,
    private readonly diffParser: DiffParserService,
    private readonly chunker: DiffChunkerService,
    private readonly summary: PrSummaryService,
    private readonly progress: PrReviewProgressPublisher,
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
            const message = 'GitHub App installation is suspended';
            throw new TerminalReviewError(message, 'validating');
          }
          return installation;
        },
      );

    await this.runs.markRunning(reviewRunId);

      const pr = await this.runStep(
        reviewRunId,
        'fetching_pr',
        (s) => {
          lastStep = s;
        },
        () =>
          this.github.getPullRequest(installationId, repoFullName, prNumber),
      );

      const { diffText, diffTruncated, apiFileIndex } = await this.runStep(
        reviewRunId,
        'fetching_diff',
        (s) => {
          lastStep = s;
        },
        async () => {
          const text = await this.github.getPullRequestDiff(
            installationId,
            repoFullName,
            prNumber,
          );
          const truncated =
            text.includes(`[Diff truncated at ${MAX_DIFF_CHARS}`) ||
            text.length >= MAX_DIFF_CHARS;

          let fileIndex: FileIndexEntry[] | undefined;
          if (truncated) {
            const apiFiles = await this.github.listPullRequestChangedFiles(
              installationId,
              repoFullName,
              prNumber,
            );
            fileIndex = apiFiles.map((f) => ({
              path: f.path,
              previousPath: f.previousPath,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
            }));
          }

          return {
            diffText: text,
            diffTruncated: truncated,
            apiFileIndex: fileIndex,
          };
        },
      );

      const parsed = await this.runStep(
        reviewRunId,
        'parsing_diff',
        (s) => {
          lastStep = s;
        },
        async () => this.diffParser.parse(diffText),
      );

      const chunks = await this.runStep(
        reviewRunId,
        'chunking',
        (s) => {
          lastStep = s;
        },
        async () => {
          const built = this.chunker.buildReviewChunks(parsed);
          if (built.length === 0) {
            throw new TerminalReviewError(
              'No reviewable additions in diff',
              'chunking',
            );
          }
          return built;
        },
        undefined,
        { fileCount: parsed.files.length },
      );

      const summaryText = await this.runStep(
        reviewRunId,
        'summarizing',
        (s) => {
          lastStep = s;
        },
        () =>
          this.summary.summarize({
            repoFullName,
            prNumber,
            title: pr.title ?? `PR #${prNumber}`,
            body: pr.body ?? null,
            parsed,
            chunks,
            fileIndex: this.chunker.buildFileIndex(parsed),
            removedOnlyFileCount: this.chunker.countRemovedOnlyFiles(parsed),
            binaryOrEmptyFileCount:
              this.chunker.countBinaryOrEmptyFiles(parsed),
            diffTruncated,
            apiFileIndex,
          }),
        undefined,
        { chunkCount: chunks.length },
      );

      const githubReviewId = await this.runStep(
        reviewRunId,
        'posting_review',
        (s) => {
          lastStep = s;
        },
        () =>
          this.github.createPullRequestReview(
            installationId,
            repoFullName,
            prNumber,
            summaryText,
          ),
      );

      await this.runs.markCompleted(reviewRunId, summaryText, githubReviewId);
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
          githubReviewId: String(githubReviewId),
          chunkCount: chunks.length,
          fileCount: parsed.files.length,
          diffTruncated,
        },
      );

      return { githubReviewId: String(githubReviewId) };
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
    try {
      const result = await fn();
      await this.progress.stepCompleted(reviewRunId, step, meta);
      return result;
    } catch (err) {
      throw err;
    }
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

class TerminalReviewError extends Error {
  constructor(
    message: string,
    readonly step: PrReviewStep,
  ) {
    super(message);
    this.name = 'TerminalReviewError';
  }
}
