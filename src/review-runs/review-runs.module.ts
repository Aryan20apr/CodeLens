import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { GithubModule } from '../github/github.module';
import { JobsModule } from '../jobs/jobs.module';
import { StreamingModule } from '../streaming/streaming.module';
import { ReviewRunsController } from './review-runs.controller';
import { ReviewRunsService } from './review-runs.service';

@Module({
  imports: [AppConfigModule, GithubModule, JobsModule, StreamingModule],
  controllers: [ReviewRunsController],
  providers: [ReviewRunsService],
  exports: [ReviewRunsService],
})
export class ReviewRunsModule {}
