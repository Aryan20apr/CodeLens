import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { GithubApiService } from './github-api.service';
import { GithubAppAuthService } from './github-app-auth.service';
import { GithubOnboardingService } from './github-onboarding.service';
import { GithubInstallationService } from './github-installation.service';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    GithubAppAuthService,
    GithubApiService,
    GithubInstallationService,
    GithubOnboardingService,
  ],
  exports: [
    GithubAppAuthService,
    GithubApiService,
    GithubInstallationService,
    GithubOnboardingService,
  ],
})
export class GithubModule {}
