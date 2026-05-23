import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Webhooks } from '@octokit/webhooks';
import type { FastifyRequest } from 'fastify';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { Public } from '../common/decorators/public.decorator';
import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { GithubWebhookService } from './github-webhook.service';

@Controller('webhooks/github')
export class GithubWebhookController {
  private readonly logger: Logger;
  private readonly webhooks: Webhooks;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly handler: GithubWebhookService,
  ) {
    this.logger = logger.child({ context: GithubWebhookController.name });
    this.webhooks = new Webhooks({ secret: config.githubApp.webhookSecret });
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: FastifyRequest,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    const className = GithubWebhookController.name;
    const methodName = 'receive';

    this.logger.info(`[${className}] [${methodName}] :: Received GitHub webhook request`, {
      event,
      deliveryId,
    });

    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      this.logger.warn(`[${className}] [${methodName}] :: Missing raw body`, {
        deliveryId,
      });
      throw new UnauthorizedException('Missing raw body');
    }
    if (!event || !deliveryId || !signature) {
      this.logger.warn(`[${className}] [${methodName}] :: Missing GitHub webhook headers`, {
        event,
        deliveryId,
        hasSignature: Boolean(signature),
      });
      throw new UnauthorizedException('Missing GitHub webhook headers');
    }

    const ok = await this.webhooks.verify(
      rawBody.toString('utf8'),
      signature,
    );
    if (!ok) {
      this.logger.warn(`[${className}] [${methodName}] :: Invalid webhook signature`, {
        deliveryId,
        event,
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (event === 'ping') {
      this.logger.info(`[${className}] [${methodName}] :: Responding to ping`, {
        deliveryId,
      });
      return { ok: true };
    }

    const payload =
      typeof req.body === 'object' && req.body !== null
        ? req.body
        : JSON.parse(rawBody.toString('utf8'));

    await this.handler.handle(event, deliveryId, payload);

    this.logger.info(`[${className}] [${methodName}] :: Webhook handled successfully`, {
      deliveryId,
      event,
    });

    return { ok: true };
  }
}
