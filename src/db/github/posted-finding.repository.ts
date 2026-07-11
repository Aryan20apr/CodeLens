import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { ReviewFinding } from '../../review/types/pr-findings.types';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PostedFindingRepository {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly prisma: PrismaService,
  ) {
    this.logger = logger.child({ context: PostedFindingRepository.name });
  }

  async findFingerprints(
    repoFullName: string,
    prNumber: number,
  ): Promise<Set<string>> {
    const rows = await this.prisma.prReviewPostedFinding.findMany({
      where: { repoFullName, prNumber },
      select: { fingerprint: true },
    });
    return new Set(rows.map((r) => r.fingerprint));
  }

  async insertMany(rows: ReviewFinding[]): Promise<void> {
    if (rows.length === 0) return;

    const className = PostedFindingRepository.name;
    const methodName = 'insertMany';

    this.logger.info(`[${className}] [${methodName}] :: Persisting posted finding fingerprints`, {
      count: rows.length,
      repoFullName: rows[0]?.repoFullName,
      prNumber: rows[0]?.prNumber,
    });

    await this.prisma.prReviewPostedFinding.createMany({
      data: rows.map((row) => ({
        repoFullName: row.repoFullName,
        prNumber: row.prNumber,
        fingerprint: row.fingerprint,
        reviewRunId: row.reviewRunId,
        filePath: row.filePath ?? null,
        category: row.category,
        headSha: row.headSha,
        githubReviewId: row.githubReviewId ?? null,
      })),
      skipDuplicates: true,
    });
  }

  async deleteByPullRequest(
    repoFullName: string,
    prNumber: number,
  ): Promise<void> {
    const className = PostedFindingRepository.name;
    const methodName = 'deleteByPullRequest';

    const result = await this.prisma.prReviewPostedFinding.deleteMany({
      where: { repoFullName, prNumber },
    });

    this.logger.info(`[${className}] [${methodName}] :: Cleared posted finding fingerprints`, {
      repoFullName,
      prNumber,
      deletedCount: result.count,
    });
  }
}
