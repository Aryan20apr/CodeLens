import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GitHubInstallationRepository } from '../db/github/github-installation.repository';

@Injectable()
export class GithubInstallationService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly installations: GitHubInstallationRepository,
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
  ) {
    const className = GithubInstallationService.name;
    const methodName = 'handleInstallationRepositoriesEvent';

    this.logger.info(
      `[${className}] [${methodName}] :: Processing installation_repositories event`,
      {
        action,
        installationId: String(installation.id),
        accountLogin: installation.account?.login,
      },
    );

    await this.installations.upsertFromInstallation(installation);

    this.logger.info(`[${className}] [${methodName}] :: Installation repositories synced`, {
      installationId: String(installation.id),
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
