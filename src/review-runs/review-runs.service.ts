import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { PrReviewRepository } from '../db/github/pr-review.repository';
import type { ReviewRunDto } from './dto/review-run.dto';

@Injectable()
export class ReviewRunsService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly runs: PrReviewRepository,
    private readonly installations: GitHubInstallationRepository,
  ) {
    this.logger = logger.child({ context: ReviewRunsService.name });
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
    status: string;
    triggeredBy: string;
    summaryText: string | null;
    githubReviewId: bigint | null;
    error: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): ReviewRunDto {
    return {
      id: run.id,
      repoFullName: run.repoFullName,
      prNumber: run.prNumber,
      headSha: run.headSha,
      baseSha: run.baseSha,
      status: run.status as ReviewRunDto['status'],
      triggeredBy: run.triggeredBy as ReviewRunDto['triggeredBy'],
      summaryText: run.summaryText,
      githubReviewId:
        run.githubReviewId != null ? String(run.githubReviewId) : null,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }
}
