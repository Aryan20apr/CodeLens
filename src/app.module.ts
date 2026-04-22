import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ClsIntegrationModule } from './cls/cls-integration.module';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './db/prisma.module';
import { LoggerModule } from './logger/logger.module';
import { RedisModule } from './redis/redis.module';
import { BullmqModule } from './bullmq/bullmq.module';
import { HealthModule } from './health/health.module';
import { ExampleJobsModule } from './src/jobs/example/example-job/example-jobs.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    AppConfigModule,
    ClsIntegrationModule,
    LoggerModule,
    RedisModule,
    PrismaModule,
    HealthModule,
    BullmqModule,
    ExampleJobsModule,
    AuthModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
