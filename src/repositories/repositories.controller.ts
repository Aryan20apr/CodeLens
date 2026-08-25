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
  async listInstallations(@CurrentUser() user: { id: string }) {
    const installations = await this.repositories.listInstallations(user.id);
    return {
      success: true,
      message: 'GitHub installations retrieved successfully',
      data: installations,
    };
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
  async listRepositories(@CurrentUser() user: { id: string }) {
    const data = await this.repositories.listRepositoriesForUser(user.id);
    return {
      success: true,
      message: 'Connected repositories retrieved successfully',
      data,
    };
  }

  @Get(':repoId/pull-requests')
  @ApiOperation({ summary: 'List pull requests for a connected repository' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'state', required: false, enum: ['open', 'closed', 'all'] })
  async listPullRequests(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('state') state?: 'open' | 'closed' | 'all',
  ) {
    const pullRequests = await this.repositories.listPullRequests(
      user.id,
      repoId,
      page ? Number(page) : 1,
      perPage ? Number(perPage) : 30,
      state ?? 'open',
    );
    return {
      success: true,
      message: 'Pull requests retrieved successfully',
      data: pullRequests,
    };
  }

  @Get(':repoId/pull-requests/:prNumber')
  @ApiOperation({ summary: 'Get pull request details' })
  async getPullRequest(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    const pr = await this.repositories.getPullRequest(user.id, repoId, prNumber);
    return {
      success: true,
      message: 'Pull request details retrieved successfully',
      data: pr,
    };
  }

  @Get(':repoId/pull-requests/:prNumber/diff')
  @ApiOperation({ summary: 'Get structured pull request diff' })
  async getPullRequestDiff(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    const diff = await this.repositories.getPullRequestDiff(user.id, repoId, prNumber);
    return {
      success: true,
      message: 'Pull request diff retrieved successfully',
      data: diff,
    };
  }

  @Get(':repoId/pull-requests/:prNumber/files')
  @ApiOperation({ summary: 'List changed files in a pull request (no hunks)' })
  async getPullRequestFiles(
    @CurrentUser() user: { id: string },
    @Param('repoId') repoId: string,
    @Param('prNumber', ParseIntPipe) prNumber: number,
  ) {
    const files = await this.repositories.getPullRequestFiles(user.id, repoId, prNumber);
    return {
      success: true,
      message: 'Pull request changed files retrieved successfully',
      data: files,
    };
  }
}
