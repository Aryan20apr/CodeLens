import { Global, Module } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { AppConfigModule } from '../config/config.module';
import { LoggerModule } from '../logger/logger.module';
import {
  REDIS_CACHE,
  REDIS_PUBSUB_PUB,
  REDIS_PUBSUB_SUB,
  REDIS_QUEUE,
} from './redis.constants';
import { RedisService } from './redis.service';

const buildBase = (redis: AppConfig['redis']): RedisOptions => ({
  host: redis.host,
  port: redis.port,
  password: redis.password,
  db: redis.db,
  enableAutoPipelining: true,
  lazyConnect: false,
  reconnectOnError: (err) => err.message.includes('READONLY'),
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

const redisClientFactory = (cfg: AppConfig) => new Redis(buildBase(cfg.redis));

@Global()
@Module({
  imports: [AppConfigModule, LoggerModule],
  providers: [
    {
      provide: REDIS_CACHE,
      useFactory: redisClientFactory,
      inject: [APP_CONFIG],
    },
    {
      provide: REDIS_QUEUE,
      useFactory: redisClientFactory,
      inject: [APP_CONFIG],
    },
    {
      provide: REDIS_PUBSUB_PUB,
      useFactory: redisClientFactory,
      inject: [APP_CONFIG],
    },
    {
      provide: REDIS_PUBSUB_SUB,
      useFactory: redisClientFactory,
      inject: [APP_CONFIG],
    },
    RedisService,
  ],
  exports: [
    REDIS_CACHE,
    REDIS_QUEUE,
    REDIS_PUBSUB_PUB,
    REDIS_PUBSUB_SUB,
    RedisService,
  ],
})
export class RedisModule {}
