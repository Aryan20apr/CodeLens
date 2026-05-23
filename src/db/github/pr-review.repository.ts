import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { PrReviewRunStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrReviewRunRepository {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly prisma: PrismaService,
  ) {
    this.logger = logger.child({ context: PrReviewRunRepository.name });
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
    const className = PrReviewRunRepository.name;
    const methodName = 'createPending';

    this.logger.info(`[${className}] [${methodName}] :: Creating pending PR review run`, {
      reviewRunId: data.id,
      deliveryId: data.deliveryId,
      installationId: String(data.installationId),
      repoFullName: data.repoFullName,
      prNumber: data.prNumber,
    });

    try {
      const record = await this.prisma.prReviewRun.create({
        data: { ...data, status: PrReviewRunStatus.PENDING },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review run created`, {
        reviewRunId: data.id,
        status: PrReviewRunStatus.PENDING,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to create PR review run`, {
        reviewRunId: data.id,
        deliveryId: data.deliveryId,
        error: err,
      });
      throw err;
    }
  }

  async findById(id: string) {
    const className = PrReviewRunRepository.name;
    const methodName = 'findById';

    this.logger.debug(`[${className}] [${methodName}] :: Looking up PR review run`, {
      reviewRunId: id,
    });

    try {
      const record = await this.prisma.prReviewRun.findUnique({ where: { id } });

      this.logger.debug(`[${className}] [${methodName}] :: PR review run lookup complete`, {
        reviewRunId: id,
        found: Boolean(record),
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to look up PR review run`, {
        reviewRunId: id,
        error: err,
      });
      throw err;
    }
  }

  async markRunning(id: string) {
    const className = PrReviewRunRepository.name;
    const methodName = 'markRunning';

    this.logger.info(`[${className}] [${methodName}] :: Marking PR review run running`, {
      reviewRunId: id,
    });

    try {
      const record = await this.prisma.prReviewRun.update({
        where: { id },
        data: { status: PrReviewRunStatus.RUNNING },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review run running`, {
        reviewRunId: id,
        status: PrReviewRunStatus.RUNNING,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to mark PR review run running`, {
        reviewRunId: id,
        error: err,
      });
      throw err;
    }
  }

  async markCompleted(id: string, summaryText: string, githubReviewId: bigint) {
    const className = PrReviewRunRepository.name;
    const methodName = 'markCompleted';

    this.logger.info(`[${className}] [${methodName}] :: Marking PR review run completed`, {
      reviewRunId: id,
      githubReviewId: String(githubReviewId),
      summaryChars: summaryText.length,
    });

    try {
      const record = await this.prisma.prReviewRun.update({
        where: { id },
        data: {
          status: PrReviewRunStatus.COMPLETED,
          summaryText,
          githubReviewId,
          completedAt: new Date(),
          error: null,
        },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review run completed`, {
        reviewRunId: id,
        status: PrReviewRunStatus.COMPLETED,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to mark PR review run completed`, {
        reviewRunId: id,
        error: err,
      });
      throw err;
    }
  }

  async markFailed(id: string, error: string) {
    const className = PrReviewRunRepository.name;
    const methodName = 'markFailed';

    this.logger.warn(`[${className}] [${methodName}] :: Marking PR review run failed`, {
      reviewRunId: id,
      error,
    });

    try {
      const record = await this.prisma.prReviewRun.update({
        where: { id },
        data: { status: PrReviewRunStatus.FAILED, error, completedAt: new Date() },
      });

      this.logger.info(`[${className}] [${methodName}] :: PR review run marked failed`, {
        reviewRunId: id,
        status: PrReviewRunStatus.FAILED,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to persist PR review run failure`, {
        reviewRunId: id,
        error: err,
      });
      throw err;
    }
  }

  async setBullmqJobId(id: string, bullmqJobId: string) {
    const className = PrReviewRunRepository.name;
    const methodName = 'setBullmqJobId';

    this.logger.info(`[${className}] [${methodName}] :: Linking BullMQ job to PR review run`, {
      reviewRunId: id,
      jobId: bullmqJobId,
    });

    try {
      const record = await this.prisma.prReviewRun.update({
        where: { id },
        data: { bullmqJobId },
      });

      this.logger.info(`[${className}] [${methodName}] :: BullMQ job linked`, {
        reviewRunId: id,
        jobId: bullmqJobId,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to link BullMQ job`, {
        reviewRunId: id,
        jobId: bullmqJobId,
        error: err,
      });
      throw err;
    }
  }
}
