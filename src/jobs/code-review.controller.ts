import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { EnqueCodeReviewDtoSchema, type EnqueueCodeReviewDto } from './dtos/code-review.dto';
import { CODE_REVIEW_QUEUE } from './constants';
import { CodeReviewProducer } from './code-review-producer.service';
import type { SnippetSource } from 'src/graph/state.types';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { zodToOpenApi } from '@common/utils/zod-to-openapi.util';
import { ApiOperation, ApiBody, ApiResponse, ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { apiEnvelopeSchema } from '@common/utils/swagger.util';

@ApiTags('CodeReview')
@Controller('codereview')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CodeReviewController {
  constructor(
    private readonly producer: CodeReviewProducer,
    @InjectQueue(CODE_REVIEW_QUEUE) private readonly queue: Queue,
  ) {}

  @Post("/job")
  @UsePipes(new ZodValidationPipe(EnqueCodeReviewDtoSchema))
  @ApiOperation({ summary: 'Enqueue a Snippet code review job' })
  @ApiBody({ schema: zodToOpenApi(EnqueCodeReviewDtoSchema) })
  @ApiResponse({
    status: 201,
    description: 'Enqueued a Snippet code review job',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
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
      { message: 'Code review job enqueued successfully' },
    ),
  })
  async enqueue(@Body() dto: EnqueueCodeReviewDto, @CurrentUser() user: any) {

    const source: SnippetSource = {
      type: 'snippet',
      code: dto.code,
      language: dto.language ?? '',
      filename: dto.filename,
    };

    const result = await this.producer.enqueue(source, user.id);
    return {
      success: true,
      message: 'Code review job enqueued successfully',
      data: result,
    };
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get code review job status and result' })
  @ApiParam({ name: 'jobId', type: String, description: 'BullMQ Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Code review job status and result',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          jobId: { type: 'string', example: '123' },
          state: { type: 'string', example: 'completed' },
          progress: { type: 'number', example: 100 },
          failedReason: { type: 'string', nullable: true, example: null },
          result: { type: 'object', nullable: true },
        },
      },
      { message: 'Code review job status retrieved successfully' },
    ),
  })
  @ApiResponse({ status: 404, description: 'Code review job not found' })
  async getResult(@Param('jobId') jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Code review job '${jobId}' not found`);
    }

    const state = await job.getState();
    const progress = job.progress;
    const failedReason = job.failedReason;

    // BullMQ stores return value after completion
    const result = job.returnvalue;

    return {
      success: true,
      message: 'Code review job status retrieved successfully',
      data: {
        jobId,
        state,
        progress,
        failedReason,
        result,
      },
    };
  }
}