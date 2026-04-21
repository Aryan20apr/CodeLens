import { Inject, Injectable } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';

import { REDIS_CACHE } from '../redis/redis.constants';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CACHE) private readonly redis: Redis,
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const check = this.healthIndicator.check(key);
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return check.down({ message: `unexpected PING reply: ${pong}` });
      }
      return check.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return check.down({ message });
    }
  }
}
