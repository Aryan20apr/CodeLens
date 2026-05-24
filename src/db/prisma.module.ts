import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { GitHubInstallationRepository } from './github/github-installation.repository';
import { ConnectionRepository } from './github/connection.repository';
import { PrReviewRepository } from './github/pr-review.repository';
import { WebhookDeliveryRepository } from './github/webhook.repository';
import { PrismaService } from './prisma.service';

/**
 * Single global DB module: Prisma client + all Prisma-backed repositories.
 * Domain repos live under `db/github/` (files only), not a separate Nest module.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    PrismaService,
    GitHubInstallationRepository,
    ConnectionRepository,
    WebhookDeliveryRepository,
    PrReviewRepository,
  ],
  exports: [
    PrismaService,
    GitHubInstallationRepository,
    ConnectionRepository,
    WebhookDeliveryRepository,
    PrReviewRepository,
  ],
})
export class PrismaModule {}
