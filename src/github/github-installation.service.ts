import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { ConnectionRepository } from '../db/github/connection.repository';

@Injectable()
export class GithubInstallationService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly installations: GitHubInstallationRepository,
    private readonly connections: ConnectionRepository,
  ) {
    this.logger = logger.child({ context: GithubInstallationService.name });
  }

  async handleInstallationEvent(
    action: string,
    installation: {
      id: number;
      account?: { login?: string; type?: string } | null;
      suspended_at?: string | null;
    },
  ) {
    const className = GithubInstallationService.name;
    const methodName = 'handleInstallationEvent';

    this.logger.info(`[${className}] [${methodName}] :: Processing installation event`, {
      action,
      installationId: String(installation.id),
      accountLogin: installation.account?.login,
    });

    if (action === 'deleted') {
      await this.installations.markDeleted(BigInt(installation.id));
      this.logger.info(`[${className}] [${methodName}] :: Installation marked deleted`, {
        installationId: String(installation.id),
      });
      return;
    }

    await this.installations.upsertFromInstallation(installation);
    this.logger.info(`[${className}] [${methodName}] :: Installation upserted`, {
      installationId: String(installation.id),
      action,
    });
  }

  async handleInstallationRepositoriesEvent(
    action: string,
    installation: {
      id: number;
      account?: { login?: string; type?: string } | null;
    },
    repositoriesAdded: Array<{
      id: number;
      full_name: string;
      private?: boolean;
    }> = [],
    repositoriesRemoved: Array<{ id: number; full_name: string }> = [],
  ) {
    const className = GithubInstallationService.name;
    const methodName = 'handleInstallationRepositoriesEvent';
    const installationId = BigInt(installation.id);

    this.logger.info(
      `[${className}] [${methodName}] :: Processing installation_repositories event`,
      {
        action,
        installationId: String(installationId),
        accountLogin: installation.account?.login,
        addedCount: repositoriesAdded.length,
        removedCount: repositoriesRemoved.length,
      },
    );

    await this.installations.upsertFromInstallation(installation);

    if (repositoriesAdded.length > 0) {
      await this.connections.upsertFromWebhook(
        installationId,
        repositoriesAdded,
      );
    }

    if (repositoriesRemoved.length > 0) {
      await this.connections.disconnectFromWebhook(
        installationId,
        repositoriesRemoved.map((r) => r.id),
      );
    }

    this.logger.info(`[${className}] [${methodName}] :: Installation repositories synced`, {
      installationId: String(installationId),
      action,
    });
  }

  async ensureFromPullRequest(installation: {
    id: number;
    account?: { login?: string; type?: string } | null;
  }) {
    const className = GithubInstallationService.name;
    const methodName = 'ensureFromPullRequest';

    this.logger.info(`[${className}] [${methodName}] :: Ensuring installation from pull_request`, {
      installationId: String(installation.id),
      accountLogin: installation.account?.login,
    });

    await this.installations.upsertFromInstallation(installation);

    this.logger.info(`[${className}] [${methodName}] :: Installation ensured`, {
      installationId: String(installation.id),
    });
  }
}
