import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EXAMPLE_QUEUE } from '../../../../bullmq/queue.constants';
import { ExampleJobsProcessor } from './example-jobs.processor';
import { ExampleJobsService } from './example-jobs.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EXAMPLE_QUEUE,
    }),
  ],
  providers: [ExampleJobsProcessor, ExampleJobsService],
  exports: [ExampleJobsService],
})
export class ExampleJobsModule {}
