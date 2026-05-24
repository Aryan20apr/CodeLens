import { Module } from '@nestjs/common';

import { ReviewRunsController } from './review-runs.controller';
import { ReviewRunsService } from './review-runs.service';

@Module({
  controllers: [ReviewRunsController],
  providers: [ReviewRunsService],
  exports: [ReviewRunsService],
})
export class ReviewRunsModule {}
