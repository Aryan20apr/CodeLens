import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import {
  PrReviewStatus,
  PrReviewTrigger,
} from '../../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrReviewRepository {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly prisma: PrismaService,
  ) {
    this.logger = logger.child({ context: PrReviewRepository.name });
  }

  async createPending(data: {
    id: string;
    deliveryId: string;
    installationId: bigint;
    repoFullName: string;
    prNumber: number;
    headSha: string;
    baseSha: string;
    bullmqJobId?: string;
  }) {
    const className = PrReviewRepository.name;
    const methodName = 'createPending';

    this.logger.info(`[${className}] [${methodName}] :: Creating pending PR review`, {
      reviewId: data.id,
      deliveryId: data.deliveryId,
      installationId: String(data.installationId),
      repoFullName: data.repoFullName,
      prNumber: data.prNumber,
    });

    try {
      const record = await this.prisma.prReview.create({
        data: {
          ...data,
          status: PrReviewStatus.PENDING,
          triggeredBy: PrReviewTrigger.WEBHOOK,
        },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review created`, {
        reviewId: data.id,
        status: PrReviewStatus.PENDING,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to create PR review`, {
        reviewId: data.id,
        deliveryId: data.deliveryId,
        error: err,
      });
      throw err;
    }
  }

  async createPendingManual(data: {
    id: string;
    userId: string;
    installationId: bigint;
    repoFullName: string;
    prNumber: number;
    headSha: string;
    baseSha: string;
    bullmqJobId?: string;
  }) {
    const className = PrReviewRepository.name;
    const methodName = 'createPendingManual';

    this.logger.info(
      `[${className}] [${methodName}] :: Creating manual PR review`,
      {
        reviewId: data.id,
        userId: data.userId,
        installationId: String(data.installationId),
        repoFullName: data.repoFullName,
        prNumber: data.prNumber,
      },
    );

    return this.prisma.prReview.create({
      data: {
        ...data,
        status: PrReviewStatus.PENDING,
        triggeredBy: PrReviewTrigger.MANUAL,
      },
    });
  }

  async findById(id: string) {
    const className = PrReviewRepository.name;
    const methodName = 'findById';

    this.logger.debug(`[${className}] [${methodName}] :: Looking up PR review`, {
      reviewId: id,
    });

    try {
      const record = await this.prisma.prReview.findUnique({ where: { id } });

      this.logger.debug(`[${className}] [${methodName}] :: PR review lookup complete`, {
        reviewId: id,
        found: Boolean(record),
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to look up PR review`, {
        reviewId: id,
        error: err,
      });
      throw err;
    }
  }

  async markRunning(id: string) {
    const className = PrReviewRepository.name;
    const methodName = 'markRunning';

    this.logger.info(`[${className}] [${methodName}] :: Marking PR review running`, {
      reviewId: id,
    });

    try {
      const record = await this.prisma.prReview.update({
        where: { id },
        data: { status: PrReviewStatus.RUNNING },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review running`, {
        reviewId: id,
        status: PrReviewStatus.RUNNING,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to mark PR review running`, {
        reviewId: id,
        error: err,
      });
      throw err;
    }
  }

  async markCompleted(id: string, summaryText: string, githubReviewId: bigint) {
    const className = PrReviewRepository.name;
    const methodName = 'markCompleted';

    this.logger.info(`[${className}] [${methodName}] :: Marking PR review completed`, {
      reviewId: id,
      githubReviewId: String(githubReviewId),
      summaryChars: summaryText.length,
    });

    try {
      const record = await this.prisma.prReview.update({
        where: { id },
        data: {
          status: PrReviewStatus.COMPLETED,
          summaryText,
          githubReviewId,
          completedAt: new Date(),
          error: null,
        },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review completed`, {
        reviewId: id,
        status: PrReviewStatus.COMPLETED,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to mark PR review completed`, {
        reviewId: id,
        error: err,
      });
      throw err;
    }
  }

  async markFailed(id: string, error: string) {
    const className = PrReviewRepository.name;
    const methodName = 'markFailed';

    this.logger.warn(`[${className}] [${methodName}] :: Marking PR review failed`, {
      reviewId: id,
      error,
    });

    try {
      const record = await this.prisma.prReview.update({
        where: { id },
        data: { status: PrReviewStatus.FAILED, error, completedAt: new Date() },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review marked failed`, {
        reviewId: id,
        status: PrReviewStatus.FAILED,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to persist PR review failure`, {
        reviewId: id,
        error: err,
      });
      throw err;
    }
  }

  async setBullmqJobId(id: string, bullmqJobId: string) {
    const className = PrReviewRepository.name;
    const methodName = 'setBullmqJobId';

    this.logger.info(`[${className}] [${methodName}] :: Linking BullMQ job to PR review`, {
      reviewId: id,
      jobId: bullmqJobId,
    });

    try {
      const record = await this.prisma.prReview.update({
        where: { id },
        data: { bullmqJobId },
      });

      this.logger.info(`[${className}] [${methodName}] :: BullMQ job linked`, {
        reviewId: id,
        jobId: bullmqJobId,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to link BullMQ job`, {
        reviewId: id,
        jobId: bullmqJobId,
        error: err,
      });
      throw err;
    }
  }

  async findByIdWithDelivery(id: string) {
    return this.prisma.prReview.findUnique({
      where: { id },
      include: { delivery: true },
    });
  }

  async findByPullRequest(
    repoFullName: string,
    prNumber: number,
    page: number,
    perPage: number,
  ) {
    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      this.prisma.prReview.findMany({
        where: { repoFullName, prNumber },
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.prReview.count({
        where: { repoFullName, prNumber },
      }),
    ]);
    return { items, total, page, perPage };
  }

  async findByPullRequestForUser(
    userId: string,
    installationIds: bigint[],
    repoFullName: string,
    prNumber: number,
    page: number,
    perPage: number,
  ) {
    const skip = (page - 1) * perPage;
    const orConditions: Array<
      { userId: string } | { installationId: { in: bigint[] } }
    > = [{ userId }];
    if (installationIds.length > 0) {
      orConditions.push({ installationId: { in: installationIds } });
    }

    const where = { repoFullName, prNumber, OR: orConditions };

    const [items, total] = await Promise.all([
      this.prisma.prReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.prReview.count({ where }),
    ]);
    return { items, total, page, perPage };
  }
}
