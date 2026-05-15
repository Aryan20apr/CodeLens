import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { EnqueCodeReviewDtoSchema, type EnqueueCodeReviewDto } from './dtos/code-review.dto';
import { CODE_REVIEW_QUEUE } from './constants';
import { ProducerService } from './producer.service';
import type { SnippetSource } from 'src/graph/state.types';
import { Public } from '@common/decorators/public.decorator';

@Controller('codereview')
@Public()
export class CodeReviewController {
  constructor(
    private readonly producer: ProducerService,
    @InjectQueue(CODE_REVIEW_QUEUE) private readonly queue: Queue,
  ) {}

  @Post("/job")
  async enqueue(@Body() body: EnqueueCodeReviewDto) {
    const dto = EnqueCodeReviewDtoSchema.parse(body);

    const source: SnippetSource = {
      type: 'snippet',
      code: dto.code,
      language: dto.language ?? '',
      filename: dto.filename,
    };

    return this.producer.enqueue(source);
  }

  @Get(':jobId')
  async getResult(@Param('jobId') jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: 'not_found' };

    const state = await job.getState();
    const progress = job.progress;
    const failedReason = job.failedReason;

    // BullMQ stores return value after completion
    const result = job.returnvalue;

    return {
      jobId,
      state,
      progress,
      failedReason,
      result,
    };
  }
}