import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RepositoriesService } from './repositories.service';

@ApiTags('Repositories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get('github/installations')
  @ApiOperation({ summary: 'List GitHub App installations for the current user' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          installationId: { type: 'string' },
          accountLogin: { type: 'string' },
          accountType: { type: 'string', example: 'User' },
        },
      },
    },
  })
  listInstallations(@CurrentUser() user: { id: string }) {
    return this.repositories.listInstallations(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List repositories connected for the current user' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean', description: 'Whether the user has at least one GitHub App installation' },
        installationCount: { type: 'number' },
        installations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              installationId: { type: 'string' },
              accountLogin: { type: 'string' },
              accountType: { type: 'string' },
            },
          },
        },
        repositories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              installationId: { type: 'string' },
              repoId: { type: 'string' },
              fullName: { type: 'string' },
              private: { type: 'boolean' },
              accountLogin: { type: 'string' },
            },
          },
        },
      },
    },
  })
  listRepositories(@CurrentUser() user: { id: string }) {
    return this.repositories.listRepositoriesForUser(user.id);
  }

  @Get(':repoId/pull-requests')
  @ApiOperation({ summary: 'List pull requests for a connected repository' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'state', required: false, enum: ['open', 'closed', 'all'] })
  listPullRequests(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('state') state?: 'open' | 'closed' | 'all',
  ) {
    return this.repositories.listPullRequests(
      user.id,
      repoId,
      page ? Number(page) : 1,
      perPage ? Number(perPage) : 30,
      state ?? 'open',
    );
  }

  @Get(':repoId/pull-requests/:prNumber')
  @ApiOperation({ summary: 'Get pull request details' })
  getPullRequest(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    return this.repositories.getPullRequest(user.id, repoId, prNumber);
  }

  @Get(':repoId/pull-requests/:prNumber/diff')
  @ApiOperation({ summary: 'Get structured pull request diff' })
  getPullRequestDiff(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    return this.repositories.getPullRequestDiff(user.id, repoId, prNumber);
  }

  @Get(':repoId/pull-requests/:prNumber/files')
  @ApiOperation({ summary: 'List changed files in a pull request (no hunks)' })
  getPullRequestFiles(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    return this.repositories.getPullRequestFiles(user.id, repoId, prNumber);
  }
}
