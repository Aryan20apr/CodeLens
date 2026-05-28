import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { JobsModule } from '../jobs/jobs.module';
import { ReviewRunsController } from './review-runs.controller';
import { ReviewRunsService } from './review-runs.service';

@Module({
  imports: [GithubModule, JobsModule],
  controllers: [ReviewRunsController],
  providers: [ReviewRunsService],
  exports: [ReviewRunsService],
})
export class ReviewRunsModule {}
