import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { GithubModule } from '../github/github.module';
import { JobsModule } from '../jobs/jobs.module';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  imports: [AppConfigModule, GithubModule, JobsModule],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService],
})
export class WebhookModule {}
