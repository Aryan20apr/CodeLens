import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import Redis from 'ioredis';
import { InjectRedis } from './decorators/inject-redis.decorator';
import { REDIS_CACHE } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @InjectRedis(REDIS_CACHE) private readonly client: Redis,
  ) {
    this.logger = logger.child({ context: RedisService.name });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSec) {
      await this.client.set(key, payload, 'EX', ttlSec);
    } else {
      await this.client.set(key, payload);
    }
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const token = crypto.randomUUID();
    const ok = await this.client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (!ok) return null;
    try {
      return await fn();
    } finally {
      const lua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      await this.client.eval(lua, 1, `lock:${key}`, token);
    }
  }

  async scanDel(pattern: string): Promise<number> {
    let total = 0;
    const stream = this.client.scanStream({ match: pattern, count: 500 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) total += await this.client.unlink(...keys);
    }
    return total;
  }
}
