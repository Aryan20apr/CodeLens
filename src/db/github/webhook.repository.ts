import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { Prisma, WebhookDeliveryStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WebhookDeliveryRepository {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly prisma: PrismaService,
  ) {
    this.logger = logger.child({ context: WebhookDeliveryRepository.name });
  }

  async createReceived(data: {
    deliveryId: string;
    event: string;
    action?: string;
    installationId?: bigint;
    repoFullName?: string;
    prNumber?: number;
    headSha?: string;
    baseSha?: string;
  }) {
    const className = WebhookDeliveryRepository.name;
    const methodName = 'createReceived';

    this.logger.info(`[${className}] [${methodName}] :: Recording received webhook delivery`, {
      deliveryId: data.deliveryId,
      event: data.event,
      action: data.action,
      installationId: data.installationId != null ? String(data.installationId) : undefined,
      repoFullName: data.repoFullName,
      prNumber: data.prNumber,
    });

    try {
      const record = await this.prisma.webhookDelivery.create({
        data: { ...data, status: WebhookDeliveryStatus.RECEIVED },
      });

      this.logger.info(`[${className}] [${methodName}] :: Webhook delivery recorded`, {
        deliveryId: data.deliveryId,
        status: WebhookDeliveryStatus.RECEIVED,
      });

      return record;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        this.logger.warn(`[${className}] [${methodName}] :: Duplicate webhook delivery`, {
          deliveryId: data.deliveryId,
        });
      } else {
        this.logger.error(`[${className}] [${methodName}] :: Failed to record webhook delivery`, {
          deliveryId: data.deliveryId,
          error: err,
        });
      }
      throw err;
    }
  }

  async markEnqueued(deliveryId: string, jobId: string) {
    return this.markStatus(deliveryId, WebhookDeliveryStatus.ENQUEUED, { jobId });
  }

  async markProcessed(deliveryId: string) {
    return this.markStatus(deliveryId, WebhookDeliveryStatus.PROCESSED);
  }

  async markIgnored(deliveryId: string) {
    return this.markStatus(deliveryId, WebhookDeliveryStatus.IGNORED);
  }

  async markFailed(deliveryId: string, error: string) {
    return this.markStatus(deliveryId, WebhookDeliveryStatus.FAILED, { error });
  }

  private async markStatus(
    deliveryId: string,
    status: WebhookDeliveryStatus,
    extra: Omit<Prisma.WebhookDeliveryUpdateInput, 'status' | 'processedAt'> = {},
  ) {
    const className = WebhookDeliveryRepository.name;
    const methodName = 'markStatus';

    const data: Prisma.WebhookDeliveryUpdateInput = {
      status,
      ...extra,
      ...(status !== WebhookDeliveryStatus.ENQUEUED && { processedAt: new Date() }),
    };

    this.logger.info(`[${className}] [${methodName}] :: Updating webhook delivery status`, {
      deliveryId,
      status,
      ...extra,
    });

    try {
      const record = await this.prisma.webhookDelivery.update({
        where: { deliveryId },
        data,
      });

      this.logger.info(`[${className}] [${methodName}] :: Webhook delivery status updated`, {
        deliveryId,
        status,
      });

      return record;
    } catch (err) {
      this.logger.error(`[${className}] [${methodName}] :: Failed to update webhook delivery status`, {
        deliveryId,
        status,
        error: err,
      });
      throw err;
    }
  }

  isUniqueViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }
}
