import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable, interval, map, switchMap, takeWhile } from 'rxjs';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReviewRunsService } from './review-runs.service';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);

@ApiTags('Review runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('review-runs')
export class ReviewRunsController {
  constructor(private readonly reviewRuns: ReviewRunsService) {}

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

  @Get(':id')
  @ApiOperation({ summary: 'Get a review run by id' })
  @ApiResponse({ status: 200, description: 'Review run' })
  findById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.reviewRuns.findById(user.id, id);
  }

  @Sse(':id/stream')
  @ApiOperation({ summary: 'Stream review run status until terminal state' })
  streamStatus(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    return interval(1500).pipe(
      switchMap(() => this.reviewRuns.getRunForStream(user.id, id)),
      map((run) => ({ data: run }) as MessageEvent),
      takeWhile((event) => {
        const status = (event.data as { status: string }).status;
        return !TERMINAL_STATUSES.has(status);
      }, true),
    );
  }
}
