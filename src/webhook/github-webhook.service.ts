import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { uuidv7 } from 'uuidv7';

import { PrReviewRepository } from '../db/github/pr-review.repository';
import { WebhookDeliveryRepository } from '../db/github/webhook.repository';
import { GithubInstallationService } from '../github/github-installation.service';
import { PrReviewProducerService } from '../jobs/pr-review-producer.service';
import {
  InstallationPayloadSchema,
  InstallationRepositoriesPayloadSchema,
  PR_REVIEW_ACTIONS,
  PullRequestPayloadSchema,
} from './github-webhook.types';

@Injectable()
export class GithubWebhookService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly runs: PrReviewRepository,
    private readonly installations: GithubInstallationService,
    private readonly producer: PrReviewProducerService,
  ) {
    this.logger = logger.child({ context: GithubWebhookService.name });
  }

  async handle(
    event: string,
    deliveryId: string,
    payload: unknown,
  ): Promise<void> {
    const className = GithubWebhookService.name;
    const methodName = 'handle';

    this.logger.info(`[${className}] [${methodName}] :: Handling webhook`, {
      event,
      deliveryId,
    });

    if (event === 'installation') {
      const parsed = InstallationPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.warn(`[${className}] [${methodName}] :: Invalid installation payload`, {
          deliveryId,
        });
        return;
      }
      this.logger.info(`[${className}] [${methodName}] :: Processing installation event`, {
        deliveryId,
        action: parsed.data.action,
        installationId: parsed.data.installation.id,
      });
      await this.installations.handleInstallationEvent(
        parsed.data.action,
        parsed.data.installation,
      );
      return;
    }

    if (event === 'installation_repositories') {
      const parsed = InstallationRepositoriesPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.warn(
          `[${className}] [${methodName}] :: Invalid installation_repositories payload`,
          { deliveryId },
        );
        return;
      }
      this.logger.info(
        `[${className}] [${methodName}] :: Processing installation_repositories event`,
        {
          deliveryId,
          action: parsed.data.action,
          installationId: parsed.data.installation.id,
        },
      );
      await this.installations.handleInstallationRepositoriesEvent(
        parsed.data.action,
        parsed.data.installation,
        parsed.data.repositories_added ?? [],
        parsed.data.repositories_removed ?? [],
      );
      return;
    }

    if (event !== 'pull_request') {
      this.logger.debug(`[${className}] [${methodName}] :: Ignoring unsupported event`, {
        deliveryId,
        event,
      });
      return;
    }

    const parsed = PullRequestPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(`[${className}] [${methodName}] :: Invalid pull_request payload`, {
        deliveryId,
      });
      return;
    }

    const { action, installation, repository, number, pull_request } =
      parsed.data;

    if (!PR_REVIEW_ACTIONS.has(action)) {
      this.logger.info(`[${className}] [${methodName}] :: Ignoring pull_request action`, {
        deliveryId,
        action,
        repoFullName: repository.full_name,
        prNumber: number,
      });
      try {
        await this.deliveries.createReceived({
          deliveryId,
          event,
          action,
          installationId: installation ? BigInt(installation.id) : undefined,
          repoFullName: repository.full_name,
          prNumber: number,
        });
        await this.deliveries.markIgnored(deliveryId);
      } catch (err) {
        if (!this.deliveries.isUniqueViolation(err)) throw err;
      }
      return;
    }

    if (!installation?.id) {
      this.logger.warn(
        `[${className}] [${methodName}] :: pull_request without installation.id`,
        { deliveryId, repoFullName: repository.full_name, prNumber: number },
      );
      return;
    }

    const installationId = BigInt(installation.id);
    const repoFullName = repository.full_name;
    const headSha = pull_request.head.sha;
    const baseSha = pull_request.base.sha;

    const eligibility =
      await this.installations.checkPullRequestInstallation(installationId);
    if (!eligibility.eligible) {
      const rejectLogByReason = {
        missing: 'pull_request for unknown installation',
        deleted: 'pull_request for deleted installation',
        suspended: 'pull_request for suspended installation',
      } as const;

      this.logger.warn(
        `[${className}] [${methodName}] :: ${rejectLogByReason[eligibility.reason]}`,
        {
          deliveryId,
          installationId: String(installationId),
          repoFullName,
          prNumber: number,
          reason: eligibility.reason,
        },
      );
      try {
        await this.deliveries.createReceived({
          deliveryId,
          event,
          action,
          installationId:
            eligibility.reason === 'missing' ? undefined : installationId,
          repoFullName,
          prNumber: number,
          headSha,
          baseSha,
        });
        if (eligibility.reason === 'suspended') {
          await this.deliveries.markFailed(
            deliveryId,
            'GitHub App installation is suspended',
          );
        } else {
          await this.deliveries.markIgnored(deliveryId);
        }
      } catch (err) {
        if (!this.deliveries.isUniqueViolation(err)) throw err;
      }
      return;
    }

    this.logger.info(`[${className}] [${methodName}] :: Enqueueing PR review`, {
      deliveryId,
      action,
      installationId: String(installationId),
      repoFullName,
      prNumber: number,
      headSha,
      baseSha,
    });

    try {
      await this.deliveries.createReceived({
        deliveryId,
        event,
        action,
        installationId,
        repoFullName,
        prNumber: number,
        headSha,
        baseSha,
      });
    } catch (err) {
      if (this.deliveries.isUniqueViolation(err)) {
        this.logger.info(`[${className}] [${methodName}] :: Duplicate webhook delivery`, {
          deliveryId,
        });
        return;
      }
      throw err;
    }

    const reviewRunId = uuidv7();
    await this.runs.createPending({
      id: reviewRunId,
      deliveryId,
      installationId,
      repoFullName,
      prNumber: number,
      headSha,
      baseSha,
    });

    const { jobId } = await this.producer.enqueue({
      deliveryId,
      reviewRunId,
      installationId: String(installationId),
      repoFullName,
      prNumber: number,
      headSha,
      baseSha,
    });

    await this.runs.setBullmqJobId(reviewRunId, jobId);
    await this.deliveries.markEnqueued(deliveryId, jobId);

    this.logger.info(`[${className}] [${methodName}] :: PR review job enqueued`, {
      deliveryId,
      reviewRunId,
      jobId,
      repoFullName,
      prNumber: number,
    });
  }
}
