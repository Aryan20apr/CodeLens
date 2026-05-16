import { Module } from '@nestjs/common';
import { RedisPubSubService } from './redis-pub-sub.service';
import { RedisModule } from 'src/redis/redis.module';
import { EventStreamController } from './event-stream.controller';

@Module({
  imports: [RedisModule],
  providers: [RedisPubSubService],
  exports: [RedisPubSubService],
  controllers: [EventStreamController]
})
export class StreamingModule {}
