import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { ConnectionRepository } from '../db/github/connection.repository';
import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { GithubApiService } from './github-api.service';

@Injectable()
export class GithubOnboardingService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly installations: GitHubInstallationRepository,
    private readonly connections: ConnectionRepository,
    private readonly githubApi: GithubApiService,
  ) {
    this.logger = logger.child({ context: GithubOnboardingService.name });
  }

  async onboardInstallation(
    installationId: number,
    userId: string,
  ): Promise<void> {
    const className = GithubOnboardingService.name;
    const methodName = 'onboardInstallation';
    const id = BigInt(installationId);

    this.logger.info(
      `[${className}] [${methodName}] :: Onboarding GitHub installation for user`,
      { installationId: String(id), userId },
    );

    const existing = await this.installations.findById(id);
    if (!existing) {
      this.logger.warn(
        `[${className}] [${methodName}] :: Installation not found, skipping`,
        { installationId: String(id), userId },
      );
      return;
    }

    await this.installations.linkUser(id, userId);

    try {
      const repos = await this.githubApi.listInstallationRepositories(id);
      await this.connections.upsertFromWebhook(id, repos);
      this.logger.info(
        `[${className}] [${methodName}] :: Seeded connections from installation`,
        { installationId: String(id), repoCount: repos.length },
      );
    } catch (err) {
      this.logger.error(
        `[${className}] [${methodName}] :: Failed to seed connections after onboarding`,
        { installationId: String(id), userId, error: err },
      );
    }
  }
}
