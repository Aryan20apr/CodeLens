import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { EnqueCodeReviewDtoSchema, type EnqueueCodeReviewDto } from './dtos/code-review.dto';
import { CODE_REVIEW_QUEUE } from './constants';
import { ProducerService } from './producer.service';
import type { SnippetSource } from 'src/graph/state.types';
import { Public } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

@Controller('codereview')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CodeReviewController {
  constructor(
    private readonly producer: ProducerService,
    @InjectQueue(CODE_REVIEW_QUEUE) private readonly queue: Queue,
  ) {}

  @Post("/job")
  @UsePipes(new ZodValidationPipe(EnqueCodeReviewDtoSchema))
  @ApiOperation({ summary: 'Enqueue a Snippet code review job' })
  @ApiBody({
    schema: {
      type: 'object',
        required: ['code', 'language', 'filename', 'threadId'],
        properties: {
          code: { type: 'string', example: 'console.log("Hello, world!");' },
          language: { type: 'string', example: 'javascript' },
          filename: { type: 'string', example: 'index.js' }
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Enqueued a Snippet code review job',
    schema: {
      properties: {
        threadId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'pending' },
        error: { type: 'string', nullable: true },
        language: { type: 'string', example: 'javascript' },
        metadata: { type: 'object', nullable: true },
        llmAnalysis: { type: 'object', nullable: true },
        score: { type: 'object', nullable: true },
        report: { type: 'object', nullable: true },
        events: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async enqueue(@Body() dto: EnqueueCodeReviewDto) {

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