import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { AppConfigModule } from '../config/config.module';
import { LoggerModule } from '../logger/logger.module';


function bullConnectionFromConfig(cfg: AppConfig): any {
    const { host, port, password, queueDb } = cfg.redis;
    return {
        host,
        port,
        db: queueDb,
        // ioredis treats '' as valid; omit password when unset
        ...(password ? { password } : {}),
        // Required for BullMQ blocking commands
        maxRetriesPerRequest: null,
        enableAutoPipelining: true,
        lazyConnect: false,
        reconnectOnError: (err: Error) => err.message.includes('READONLY'),
        retryStrategy: (times: number) => Math.min(times * 200, 2000),
      };
}


@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    BullModule.forRootAsync({
        imports: [AppConfigModule],
        useFactory: (cfg: AppConfig) => ({
            connection: bullConnectionFromConfig(cfg),
        }),
        inject: [APP_CONFIG]
    }),
  ],
  exports: [BullModule]
})
export class BullmqModule {}
