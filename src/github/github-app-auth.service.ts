import { Inject, Injectable } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';

@Injectable()
export class GithubAppAuthService {
  private readonly logger: Logger;
  private readonly appId: string;
  private readonly privateKey: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.logger = logger.child({ context: GithubAppAuthService.name });
    this.appId = config.githubApp.appId;
    this.privateKey = config.githubApp.privateKey;
  }

  getInstallationOctokit(
    installationId: string | number | bigint,
  ): Octokit {
    const className = GithubAppAuthService.name;
    const methodName = 'getInstallationOctokit';

    const id =
      typeof installationId === 'bigint'
        ? Number(installationId)
        : Number(installationId);

    this.logger.debug(`[${className}] [${methodName}] :: Creating installation Octokit client`, {
      installationId: String(installationId),
    });

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.privateKey,
        installationId: id,
      },
    });
  }
}
