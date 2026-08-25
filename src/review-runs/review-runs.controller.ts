import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RedisPubSubService } from '../streaming/redis-pub-sub.service';
import {
  prReviewChannel,
  type PrReviewRedisMessage,
} from '../streaming/types/pr-review-progress.types';
import { ReviewRunsService } from './review-runs.service';
import { apiEnvelopeSchema } from '../common/utils/swagger.util';

const ReviewRunSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    repoFullName: { type: 'string', example: 'octocat/hello-world' },
    prNumber: { type: 'number', example: 42 },
    headSha: { type: 'string', example: '6dcb09b5b57875f334f61aebed695e2e4193db5e' },
    baseSha: { type: 'string', example: '9a0a1a01174092b3a0f7f329de4b1a4a4d693fbe' },
    status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'], example: 'COMPLETED' },
    triggeredBy: { type: 'string', enum: ['WEBHOOK', 'MANUAL'], example: 'MANUAL' },
    summaryText: { type: 'string', nullable: true, example: 'Code review completed with 2 findings.' },
    githubReviewId: { type: 'string', nullable: true, example: '123456789' },
    error: { type: 'string', nullable: true, example: null },
    currentStep: { type: 'string', nullable: true, example: 'postReview' },
    currentStepMessage: { type: 'string', nullable: true, example: 'Review posted to GitHub PR' },
    createdAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);

function isPrReviewRedisMessage(value: unknown): value is PrReviewRedisMessage {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: string }).type;
  return t === 'step' || t === 'done';
}

@ApiTags('Review runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('review-runs')
export class ReviewRunsController {
  constructor(
    private readonly reviewRuns: ReviewRunsService,
    private readonly pubsub: RedisPubSubService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List review runs for a pull request' })
  @ApiQuery({ name: 'repoFullName', required: true })
  @ApiQuery({ name: 'prNumber', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of review runs',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          items: { type: 'array', items: ReviewRunSchema },
          total: { type: 'number', example: 1 },
          page: { type: 'number', example: 1 },
          perPage: { type: 'number', example: 20 },
        },
      },
      { message: 'Review runs retrieved successfully' },
    ),
  })
  async listByPullRequest(
    @CurrentUser() user: { id: string },
    @Query('repoFullName') repoFullName: string,
    @Query('prNumber', ParseIntPipe) prNumber: number,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const runs = await this.reviewRuns.findByPullRequest(
      user.id,
      repoFullName,
      prNumber,
      page ? Number(page) : 1,
      perPage ? Number(perPage) : 20,
    );
    return {
      success: true,
      message: 'Review runs retrieved successfully',
      data: runs,
    };
  }

  @Post('repositories/:repoId/pull-requests/:prNumber')
  @ApiOperation({ summary: 'Trigger a CodeLens review for a pull request' })
  @ApiParam({ name: 'repoId', type: String, description: 'Repository ID' })
  @ApiParam({ name: 'prNumber', type: Number, description: 'Pull request number' })
  @ApiResponse({
    status: 201,
    description: 'PR review enqueued',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          reviewRunId: { type: 'string', format: 'uuid', example: '01952f4a-71bc-7000-8f1d-91b427b03a7a' },
        },
      },
      { message: 'PR review triggered successfully' },
    ),
  })
  async triggerReview(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    const result = await this.reviewRuns.triggerReview(user.id, repoId, prNumber);
    return {
      success: true,
      message: 'PR review triggered successfully',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a review run by id' })
  @ApiParam({ name: 'id', type: String, description: 'Review run UUID' })
  @ApiResponse({
    status: 200,
    description: 'Review run details',
    schema: apiEnvelopeSchema(ReviewRunSchema, {
      message: 'Review run retrieved successfully',
    }),
  })
  @ApiResponse({ status: 404, description: 'Review run not found' })
  async findById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const run = await this.reviewRuns.findById(user.id, id);
    return {
      success: true,
      message: 'Review run retrieved successfully',
      data: run,
    };
  }

  @Get(':id/stream')
  @ApiOperation({
    summary: 'Stream review run progress (snapshot, steps, done)',
  })
  @ApiParam({ name: 'id', type: String, description: 'Review run UUID' })
  @ApiResponse({
    status: 200,
    description: 'SSE stream of review run events (snapshot, step, done)',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          example: 'event: snapshot\ndata: {"id":"01952f4a-71bc-7000-8f1d-91b427b03a7a","status":"RUNNING"}\n\n',
        },
      },
    },
  })
  async streamStatus(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const run = await this.reviewRuns.getSnapshotForStream(user.id, id);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('snapshot', run);

    if (TERMINAL_STATUSES.has(run.status)) {
      send('done', {
        reviewRunId: id,
        status: run.status,
        error: run.error ?? undefined,
        at: new Date().toISOString(),
      });
      reply.raw.end();
      return;
    }

    const channel = prReviewChannel(id);
    let closed = false;

    const unsubscribe = await this.pubsub.subscribe(channel, (msg) => {
      if (closed) return;
      if (!isPrReviewRedisMessage(msg)) return;

      if (msg.type === 'step') {
        send('step', msg);
        return;
      }

      send('done', msg);
      closed = true;
      void unsubscribe().then(() => {
        if (!reply.raw.destroyed) reply.raw.end();
      });
    });

    reply.raw.on('close', () => {
      closed = true;
      void unsubscribe();
    });
  }
}
