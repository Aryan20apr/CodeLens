import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClsIntegrationModule } from './cls/cls-integration.module';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './db/prisma.module';
import { LoggerModule } from './logger/logger.module';
import { RedisModule } from './redis/redis.module';
import { BullmqModule } from './bullmq/bullmq.module';
import { ExampleJobsModule } from './src/jobs/example/example-job/example-jobs.module';

@Module({
  imports: [
    AppConfigModule,
    ClsIntegrationModule,
    LoggerModule,
    RedisModule,
    PrismaModule,
    BullmqModule,
    ExampleJobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
