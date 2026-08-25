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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RepositoriesService } from './repositories.service';
import { apiEnvelopeSchema, apiArrayEnvelopeSchema } from '../common/utils/swagger.util';

const PullRequestSummarySchema = {
  type: 'object',
  properties: {
    number: { type: 'number', example: 42 },
    title: { type: 'string', example: 'feat: add user authentication' },
    state: { type: 'string', example: 'open' },
    authorLogin: { type: 'string', nullable: true, example: 'octocat' },
    headSha: { type: 'string', example: '6dcb09b5b57875f334f61aebed695e2e4193db5e' },
    baseSha: { type: 'string', example: '9a0a1a01174092b3a0f7f329de4b1a4a4d693fbe' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    htmlUrl: { type: 'string', format: 'uri', example: 'https://github.com/owner/repo/pull/42' },
  },
};

const PullRequestDetailSchema = {
  type: 'object',
  properties: {
    ...PullRequestSummarySchema.properties,
    body: { type: 'string', nullable: true, example: 'Resolves issue #12' },
    merged: { type: 'boolean', example: false },
    draft: { type: 'boolean', example: false },
  },
};

const FileDiffHunkSchema = {
  type: 'object',
  properties: {
    header: { type: 'string', example: '@@ -1,4 +1,5 @@' },
    oldStart: { type: 'number', example: 1 },
    oldLines: { type: 'number', example: 4 },
    newStart: { type: 'number', example: 1 },
    newLines: { type: 'number', example: 5 },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['context', 'add', 'delete'], example: 'add' },
          content: { type: 'string', example: '+import fastify from "fastify";' },
          oldLineNumber: { type: 'number', nullable: true, example: null },
          newLineNumber: { type: 'number', nullable: true, example: 2 },
        },
      },
    },
  },
};

const FileDiffSchema = {
  type: 'object',
  properties: {
    filename: { type: 'string', example: 'src/main.ts' },
    previousFilename: { type: 'string', nullable: true, example: null },
    status: { type: 'string', enum: ['added', 'modified', 'removed', 'renamed', 'copied'], example: 'modified' },
    additions: { type: 'number', example: 12 },
    deletions: { type: 'number', example: 3 },
    patch: { type: 'string', nullable: true, example: '@@ -1,4 +1,5 @@...' },
    hunks: {
      type: 'array',
      items: FileDiffHunkSchema,
    },
  },
};

const ParsedDiffSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: FileDiffSchema,
    },
    totalAdditions: { type: 'number', example: 12 },
    totalDeletions: { type: 'number', example: 3 },
  },
};

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
    description: 'List of user GitHub installations',
    schema: apiArrayEnvelopeSchema(
      {
        type: 'object',
        properties: {
          installationId: { type: 'string', example: '12345678' },
          accountLogin: { type: 'string', example: 'octocat' },
          accountType: { type: 'string', example: 'User' },
        },
      },
      { message: 'GitHub installations retrieved successfully' },
    ),
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
    description: 'Connected repositories with installation metadata',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          connected: { type: 'boolean', description: 'Whether the user has at least one GitHub App installation' },
          installationCount: { type: 'number', example: 1 },
          installations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                installationId: { type: 'string', example: '12345678' },
                accountLogin: { type: 'string', example: 'octocat' },
                accountType: { type: 'string', example: 'User' },
              },
            },
          },
          repositories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                installationId: { type: 'string', example: '12345678' },
                repoId: { type: 'string', example: '987654321' },
                fullName: { type: 'string', example: 'octocat/hello-world' },
                private: { type: 'boolean', example: false },
                accountLogin: { type: 'string', example: 'octocat' },
              },
            },
          },
        },
      },
      { message: 'Connected repositories retrieved successfully' },
    ),
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
  @ApiParam({ name: 'repoId', type: String, description: 'Repository ID or full name identifier' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'state', required: false, enum: ['open', 'closed', 'all'] })
  @ApiResponse({
    status: 200,
    description: 'List of pull requests',
    schema: apiArrayEnvelopeSchema(PullRequestSummarySchema, {
      message: 'Pull requests retrieved successfully',
    }),
  })
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
  @ApiParam({ name: 'repoId', type: String, description: 'Repository ID' })
  @ApiParam({ name: 'prNumber', type: Number, description: 'Pull request number' })
  @ApiResponse({
    status: 200,
    description: 'Pull request details',
    schema: apiEnvelopeSchema(PullRequestDetailSchema, {
      message: 'Pull request details retrieved successfully',
    }),
  })
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
  @ApiParam({ name: 'repoId', type: String, description: 'Repository ID' })
  @ApiParam({ name: 'prNumber', type: Number, description: 'Pull request number' })
  @ApiResponse({
    status: 200,
    description: 'Structured pull request diff',
    schema: apiEnvelopeSchema(ParsedDiffSchema, {
      message: 'Pull request diff retrieved successfully',
    }),
  })
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
  @ApiParam({ name: 'repoId', type: String, description: 'Repository ID' })
  @ApiParam({ name: 'prNumber', type: Number, description: 'Pull request number' })
  @ApiResponse({
    status: 200,
    description: 'List of changed files',
    schema: apiArrayEnvelopeSchema(
      {
        type: 'object',
        properties: {
          filename: { type: 'string', example: 'src/main.ts' },
          previousFilename: { type: 'string', nullable: true, example: null },
          status: { type: 'string', enum: ['added', 'modified', 'removed', 'renamed', 'copied'], example: 'modified' },
          additions: { type: 'number', example: 12 },
          deletions: { type: 'number', example: 3 },
          patch: { type: 'string', nullable: true, example: '@@ -1,4 +1,5 @@...' },
          hunks: { type: 'array', items: { type: 'object' }, example: [] },
        },
      },
      { message: 'Pull request changed files retrieved successfully' },
    ),
  })
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
