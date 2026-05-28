import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_PUBSUB_PUB, REDIS_PUBSUB_SUB } from 'src/redis/redis.constants';

@Injectable()
export class RedisPubSubService {
  constructor(
    @Inject(REDIS_PUBSUB_PUB) private readonly pub: Redis,
    @Inject(REDIS_PUBSUB_SUB) private readonly sub: Redis,
  ) {}

  async publish(channel: string, payload: unknown) {
    await this.pub.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, onMessage: (data: unknown) => void) {
    const handler = (ch: string, message: string) => {
      if (ch !== channel) return;
      try {
        onMessage(JSON.parse(message));
      } catch {
        onMessage({ raw: message });
      }
    };

    this.sub.on('message', handler);
    await this.sub.subscribe(channel);

    return async () => {
      await this.sub.unsubscribe(channel);
      this.sub.off('message', handler);
    };
  }
}