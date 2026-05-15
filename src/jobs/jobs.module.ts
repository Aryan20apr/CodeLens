import { Module } from '@nestjs/common';
import { ProducerService } from './producer.service';
import { CodeReviewProcessor} from './code-review-processor.service';
import { CodeReviewController } from './code-review-controller.controller';
import { GraphModule } from 'src/graph/graph.module';
import { BullModule } from '@nestjs/bullmq';
import { CODE_REVIEW_QUEUE } from './constants';

@Module({

  imports: [GraphModule, BullModule, BullModule.registerQueue({
    name: CODE_REVIEW_QUEUE
  })],
  providers: [ProducerService, CodeReviewProcessor],
  controllers: [CodeReviewController]
})
export class JobsModule {}
