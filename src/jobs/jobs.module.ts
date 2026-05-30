import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GraphModule } from 'src/graph/graph.module';

import { DiffModule } from '../diff/diff.module';
import { GithubModule } from '../github/github.module';
import { ReviewModule } from '../review/review.module';
import { CodeReviewProcessor } from './code-review-processor.service';
import { CodeReviewController } from './code-review.controller';
import { CODE_REVIEW_QUEUE, PR_REVIEW_QUEUE } from './constants';
import { PrReviewProcessorService } from './pr-review-processor.service';
import { PrReviewProducerService } from './pr-review-producer.service';
import { CodeReviewProducer } from './code-review-producer.service';
import { StreamingModule } from 'src/streaming/streaming.module';

@Module({
  imports: [
    GraphModule,
    DiffModule,
    StreamingModule,
    GithubModule,
    ReviewModule,
    BullModule,
    BullModule.registerQueue({ name: CODE_REVIEW_QUEUE }),
    BullModule.registerQueue({ name: PR_REVIEW_QUEUE }),
  ],
  providers: [
    CodeReviewProducer,
    CodeReviewProcessor,
    PrReviewProducerService,
    PrReviewProcessorService,
  ],
  controllers: [CodeReviewController],
  exports: [PrReviewProducerService],
})
export class JobsModule {}
