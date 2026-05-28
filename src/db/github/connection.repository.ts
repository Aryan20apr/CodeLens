import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { PrismaService } from '../prisma.service';

export type WebhookRepoPayload = {
  id: number;
  full_name: string;
  private?: boolean;
};

@Injectable()
export class ConnectionRepository {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly prisma: PrismaService,
  ) {
    this.logger = logger.child({ context: ConnectionRepository.name });
  }

  async upsertFromWebhook(
    installationId: bigint,
    repos: WebhookRepoPayload[],
  ) {
    const className = ConnectionRepository.name;
    const methodName = 'upsertFromWebhook';

    this.logger.info(
      `[${className}] [${methodName}] :: Upserting connections`,
      {
        installationId: String(installationId),
        repoCount: repos.length,
      },
    );

    for (const repo of repos) {
      await this.prisma.connection.upsert({
        where: {
          installationId_repoId: {
            installationId,
            repoId: BigInt(repo.id),
          },
        },
        create: {
          installationId,
          repoId: BigInt(repo.id),
          repoFullName: repo.full_name,
          private: repo.private ?? false,
          disconnectedAt: null,
        },
        update: {
          repoFullName: repo.full_name,
          private: repo.private ?? false,
          disconnectedAt: null,
        },
      });
    }
  }

  async disconnectFromWebhook(installationId: bigint, repoIds: number[]) {
    const className = ConnectionRepository.name;
    const methodName = 'disconnectFromWebhook';

    this.logger.info(
      `[${className}] [${methodName}] :: Disconnecting connections`,
      {
        installationId: String(installationId),
        repoCount: repoIds.length,
      },
    );

    if (repoIds.length === 0) return;

    await this.prisma.connection.updateMany({
      where: {
        installationId,
        repoId: { in: repoIds.map((id) => BigInt(id)) },
        disconnectedAt: null,
      },
      data: { disconnectedAt: new Date() },
    });
  }

  async findActiveByInstallation(installationId: bigint) {
    return this.prisma.connection.findMany({
      where: { installationId, disconnectedAt: null },
      orderBy: { repoFullName: 'asc' },
    });
  }

  async findActiveByUser(userId: string, installationIds: bigint[]) {
    if (installationIds.length === 0) return [];

    return this.prisma.connection.findMany({
      where: {
        installationId: { in: installationIds },
        disconnectedAt: null,
        installation: {
          userId,
          deletedAt: null,
        },
      },
      orderBy: { repoFullName: 'asc' },
    });
  }
}
