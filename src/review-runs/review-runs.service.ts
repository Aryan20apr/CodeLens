import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { uuidv7 } from 'uuidv7';
import type { Logger } from 'winston';

import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { PostedFindingRepository } from '../db/github/posted-finding.repository';
import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { PrReviewRepository } from '../db/github/pr-review.repository';
import { ReviewMode } from '../../generated/prisma/client';
import { GithubApiService } from '../github/github-api.service';
import { PrReviewProducerService } from '../jobs/pr-review-producer.service';
import { resolveReviewEnqueue } from '../review/pr-review-mode.util';
import type { ReviewRunDto } from './dto/review-run.dto';

@Injectable()
export class ReviewRunsService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly runs: PrReviewRepository,
    private readonly postedFindings: PostedFindingRepository,
    private readonly installations: GitHubInstallationRepository,
    private readonly github: GithubApiService,
    private readonly producer: PrReviewProducerService,
  ) {
    this.logger = logger.child({ context: ReviewRunsService.name });
  }

  async triggerReview(
    userId: string,
    repoId: string,
    prNumber: number,
  ): Promise<{ reviewRunId: string }> {
    const className = ReviewRunsService.name;
    const methodName = 'triggerReview';

    const { installationId, repoFullName } =
      await this.installations.resolveRepoForUser(userId, repoId);

    this.logger.info(
      `[${className}] [${methodName}] :: Triggering manual PR review`,
      {
        userId,
        repoFullName,
        prNumber,
        installationId: String(installationId),
      },
    );

    const pr = await this.github.getPullRequest(
      installationId,
      repoFullName,
      prNumber,
    );
    const headSha = pr.head.sha;
    const baseSha = pr.base.sha;

    const [prior, inFlight] = await Promise.all([
      this.runs.findLatestCompletedWithReview(repoFullName, prNumber),
      this.runs.findInFlight(repoFullName, prNumber),
    ]);

    const decision = resolveReviewEnqueue({
      headSha,
      prior,
      incrementalEnabled: this.appConfig.prReview.incremental.enabled,
      skipIfInFlight: this.appConfig.prReview.incremental.skipIfInFlight,
      hasInFlight: inFlight != null,
      forceFull: true,
    });

    if (decision.kind === 'SKIP_IN_FLIGHT') {
      throw new ConflictException(
        `A review is already in progress for ${repoFullName}#${prNumber}`,
      );
    }

    if (decision.kind === 'SKIP_SAME_SHA') {
      throw new ConflictException(
        `No new commits to review for ${repoFullName}#${prNumber}`,
      );
    }

    if (decision.reviewMode === ReviewMode.FULL) {
      await this.postedFindings.deleteByPullRequest(repoFullName, prNumber);
    }

    const reviewRunId = uuidv7();

    await this.runs.createPendingManual({
      id: reviewRunId,
      userId,
      installationId,
      repoFullName,
      prNumber,
      headSha,
      baseSha,
      reviewMode: decision.reviewMode,
      priorHeadSha: decision.priorHeadSha,
      parentRunId: decision.parentRunId,
    });

    const { jobId } = await this.producer.enqueue({
      reviewRunId,
      installationId: String(installationId),
      repoFullName,
      prNumber,
      headSha,
      baseSha,
      reviewMode: decision.reviewMode,
      priorHeadSha: decision.priorHeadSha ?? undefined,
      parentRunId: decision.parentRunId ?? undefined,
    });

    await this.runs.setBullmqJobId(reviewRunId, jobId);

    this.logger.info(
      `[${className}] [${methodName}] :: Manual PR review enqueued`,
      {
        reviewRunId,
        jobId,
        repoFullName,
        prNumber,
      },
    );

    return { reviewRunId };
  }

  async findById(userId: string, runId: string): Promise<ReviewRunDto> {
    const run = await this.runs.findById(runId);
    if (!run) {
      throw new NotFoundException(`Review run not found: ${runId}`);
    }
    await this.assertUserCanAccessRun(userId, run);
    return this.toDto(run);
  }

  async findByPullRequest(
    userId: string,
    repoFullName: string,
    prNumber: number,
    page: number,
    perPage: number,
  ) {
    await this.assertUserCanAccessRepo(userId, repoFullName);
    const installations = await this.installations.findActiveByUserId(userId);
    const installationIds = installations.map((i) => i.installationId);
    const result = await this.runs.findByPullRequestForUser(
      userId,
      installationIds,
      repoFullName,
      prNumber,
      page,
      perPage,
    );
    return {
      items: result.items.map((r) => this.toDto(r)),
      total: result.total,
      page: result.page,
      perPage: result.perPage,
    };
  }

  async getRunForStream(userId: string, runId: string): Promise<ReviewRunDto> {
    return this.getSnapshotForStream(userId, runId);
  }

  async getSnapshotForStream(
    userId: string,
    runId: string,
  ): Promise<ReviewRunDto> {
    return this.findById(userId, runId);
  }

  private async assertUserCanAccessRun(
    userId: string,
    run: {
      userId: string | null;
      installationId: bigint;
      repoFullName: string;
    },
  ) {
    if (run.userId === userId) return;

    const installation = await this.installations.findById(run.installationId);
    if (installation?.userId === userId && !installation.deletedAt) {
      return;
    }

    throw new ForbiddenException('Not allowed to access this review run');
  }

  private async assertUserCanAccessRepo(userId: string, repoFullName: string) {
    const record = await this.installations.findByUserAndRepo(
      userId,
      repoFullName,
    );
    if (!record) {
      throw new ForbiddenException(
        `No access to repository ${repoFullName}`,
      );
    }
  }

  private toDto(run: {
    id: string;
    repoFullName: string;
    prNumber: number;
    headSha: string;
    baseSha: string;
    reviewMode: 'FULL' | 'INCREMENTAL';
    priorHeadSha: string | null;
    status: string;
    triggeredBy: string;
    summaryText: string | null;
    githubReviewId: bigint | null;
    error: string | null;
    currentStep: string | null;
    currentStepMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): ReviewRunDto {
    return {
      id: run.id,
      repoFullName: run.repoFullName,
      prNumber: run.prNumber,
      headSha: run.headSha,
      baseSha: run.baseSha,
      reviewMode: run.reviewMode,
      priorHeadSha: run.priorHeadSha,
      status: run.status as ReviewRunDto['status'],
      triggeredBy: run.triggeredBy as ReviewRunDto['triggeredBy'],
      summaryText: run.summaryText,
      githubReviewId:
        run.githubReviewId != null ? String(run.githubReviewId) : null,
      error: run.error,
      currentStep: run.currentStep,
      currentStepMessage: run.currentStepMessage,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }
}
