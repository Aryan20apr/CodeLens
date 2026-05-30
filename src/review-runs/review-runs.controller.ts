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
  listByPullRequest(
    @CurrentUser() user: { id: string },
    @Query('repoFullName') repoFullName: string,
    @Query('prNumber', ParseIntPipe) prNumber: number,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.reviewRuns.findByPullRequest(
      user.id,
      repoFullName,
      prNumber,
      page ? Number(page) : 1,
      perPage ? Number(perPage) : 20,
    );
  }

  @Post('repositories/:repoId/pull-requests/:prNumber')
  @ApiOperation({ summary: 'Trigger a CodeLens review for a pull request' })
  @ApiResponse({
    status: 201,
    schema: {
      properties: {
        reviewRunId: { type: 'string', format: 'uuid' },
      },
    },
  })
  triggerReview(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    return this.reviewRuns.triggerReview(user.id, repoId, prNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a review run by id' })
  @ApiResponse({ status: 200, description: 'Review run' })
  findById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.reviewRuns.findById(user.id, id);
  }

  @Get(':id/stream')
  @ApiOperation({
    summary: 'Stream review run progress (snapshot, steps, done)',
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
