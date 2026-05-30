import { Module } from '@nestjs/common';
import { RedisModule } from 'src/redis/redis.module';

import { EventStreamController } from './event-stream.controller';
import { PrReviewProgressPublisher } from './pr-review-progress-publisher.service';
import { RedisPubSubService } from './redis-pub-sub.service';

@Module({
  imports: [RedisModule],
  providers: [RedisPubSubService, PrReviewProgressPublisher],
  exports: [RedisPubSubService, PrReviewProgressPublisher],
  controllers: [EventStreamController],
})
export class StreamingModule {}
