import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { GithubApiService } from './github-api.service';
import { GithubAppAuthService } from './github-app-auth.service';
import { GithubInstallationService } from './github-installation.service';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    GithubAppAuthService,
    GithubApiService,
    GithubInstallationService,
  ],
  exports: [
    GithubAppAuthService,
    GithubApiService,
    GithubInstallationService,
  ],
})
export class GithubModule {}
