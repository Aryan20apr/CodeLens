import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { PrismaService } from '../prisma.service';

@Injectable()
export class GitHubInstallationRepository {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly prisma: PrismaService,
  ) {
    this.logger = logger.child({ context: GitHubInstallationRepository.name });
  }

  async upsertFromInstallation(payload: {
    id: number;
    account?: { login?: string; type?: string } | null;
    suspended_at?: string | null;
  }) {
    const className = GitHubInstallationRepository.name;
    const methodName = 'upsertFromInstallation';
    const installationId = BigInt(payload.id);

    this.logger.info(`[${className}] [${methodName}] :: Upserting GitHub installation`, {
      installationId: String(installationId),
      accountLogin: payload.account?.login,
      accountType: payload.account?.type,
      suspended: Boolean(payload.suspended_at),
    });

    const accountLogin = payload.account?.login ?? 'unknown';
    const accountType = payload.account?.type ?? 'Unknown';
    const suspendedAt = payload.suspended_at ? new Date(payload.suspended_at) : null;

    try {
      const record = await this.prisma.gitHubInstallation.upsert({
        where: { installationId },
        create: {
          installationId,
          accountLogin,
          accountType,
          suspendedAt,
          deletedAt: null,
        },
        update: {
          accountLogin,
          accountType,
          suspendedAt,
          deletedAt: null,
          updatedAt: new Date(),
        },
      });

      this.logger.info(`[${className}] [${methodName}] :: GitHub installation upserted`, {
        installationId: String(installationId),
        accountLogin: record.accountLogin,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to upsert GitHub installation`, {
        installationId: String(installationId),
        error: err,
      });
      throw err;
    }
  }

  async markDeleted(installationId: bigint) {
    const className = GitHubInstallationRepository.name;
    const methodName = 'markDeleted';

    this.logger.info(`[${className}] [${methodName}] :: Marking GitHub installation deleted`, {
      installationId: String(installationId),
    });

    try {
      const record = await this.prisma.gitHubInstallation.update({
        where: { installationId },
        data: { deletedAt: new Date() },
      });

      this.logger.info(`[${className}] [${methodName}] :: GitHub installation marked deleted`, {
        installationId: String(installationId),
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to mark GitHub installation deleted`, {
        installationId: String(installationId),
        error: err,
      });
      throw err;
    }
  }

  async findById(installationId: bigint) {
    const className = GitHubInstallationRepository.name;
    const methodName = 'findById';

    this.logger.debug(`[${className}] [${methodName}] :: Looking up GitHub installation`, {
      installationId: String(installationId),
    });

    try {
      const record = await this.prisma.gitHubInstallation.findUnique({
        where: { installationId },
      });

      this.logger.debug(`[${className}] [${methodName}] :: GitHub installation lookup complete`, {
        installationId: String(installationId),
        found: Boolean(record),
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to look up GitHub installation`, {
        installationId: String(installationId),
        error: err,
      });
      throw err;
    }
  }

  async linkUser(installationId: bigint, userId: string) {
    const className = GitHubInstallationRepository.name;
    const methodName = 'linkUser';

    this.logger.info(`[${className}] [${methodName}] :: Linking installation to user`, {
      installationId: String(installationId),
      userId,
    });

    return this.prisma.gitHubInstallation.update({
      where: { installationId },
      data: { userId },
    });
  }

  async findActiveByUserId(userId: string) {
    return this.prisma.gitHubInstallation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { installedAt: 'desc' },
    });
  }

  async findByUserAndRepo(userId: string, repoFullName: string) {
    return this.prisma.connection.findFirst({
      where: {
        repoFullName,
        disconnectedAt: null,
        installation: {
          userId,
          deletedAt: null,
        },
      },
      include: { installation: true },
    });
  }

  async resolveInstallationId(
    userId: string,
    owner: string,
    repo: string,
  ): Promise<bigint> {
    const repoFullName = `${owner}/${repo}`;
    const record = await this.findByUserAndRepo(userId, repoFullName);

    if (!record?.installation) {
      throw new ForbiddenException(`No access to repository ${repoFullName}`);
    }

    if (record.installation.suspendedAt) {
      throw new ForbiddenException('GitHub App installation is suspended');
    }

    return record.installationId;
  }
}
