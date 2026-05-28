import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { ConnectionRepository } from '../db/github/connection.repository';
import { GitHubInstallationRepository } from '../db/github/github-installation.repository';
import { DiffParserService } from '../diff/diff-parser.service';
import type { FileDiff, ParsedDiff } from '../diff/types/parsed-diff.types';
import { GithubApiService } from '../github/github-api.service';
import type { PullRequestDetailDto } from './dto/pull-request-detail.dto';
import type { PullRequestSummaryDto } from './dto/pull-request-summary.dto';
import type { InstallationDto, RepositoryListDto } from './dto/repository-list.dto';
import type { RepositoryDto } from './dto/repository.dto';

@Injectable()
export class RepositoriesService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly installations: GitHubInstallationRepository,
    private readonly connections: ConnectionRepository,
    private readonly github: GithubApiService,
    private readonly diffParser: DiffParserService,
  ) {
    this.logger = logger.child({ context: RepositoriesService.name });
  }

  async listInstallations(userId: string): Promise<InstallationDto[]> {
    const userInstallations = await this.installations.findActiveByUserId(userId);
    return userInstallations.map((i) => ({
      installationId: String(i.installationId),
      accountLogin: i.accountLogin,
      accountType: i.accountType,
    }));
  }

  async listRepositoriesForUser(userId: string): Promise<RepositoryListDto> {
    const className = RepositoriesService.name;
    const methodName = 'listRepositoriesForUser';

    this.logger.info(
      `[${className}] [${methodName}] :: Listing repositories for user`,
      { userId },
    );

    const userInstallations = await this.installations.findActiveByUserId(userId);
    const installationIds = userInstallations.map((i) => i.installationId);
    const loginByInstall = new Map(
      userInstallations.map((i) => [String(i.installationId), i.accountLogin]),
    );

    const repos = await this.connections.findActiveByUser(userId, installationIds);

    const installations: InstallationDto[] = userInstallations.map((i) => ({
      installationId: String(i.installationId),
      accountLogin: i.accountLogin,
      accountType: i.accountType,
    }));

    const repositories: RepositoryDto[] = repos.map((r) => ({
      installationId: String(r.installationId),
      repoId: String(r.repoId),
      fullName: r.repoFullName,
      private: r.private,
      accountLogin: loginByInstall.get(String(r.installationId)) ?? 'unknown',
    }));

    return {
      connected: userInstallations.length > 0,
      installationCount: userInstallations.length,
      installations,
      repositories,
    };
  }

  async listPullRequests(
    userId: string,
    repoId: string,
    page: number,
    perPage: number,
    state: 'open' | 'closed' | 'all' = 'open',
  ): Promise<PullRequestSummaryDto[]> {
    const { installationId, repoFullName } =
      await this.installations.resolveRepoForUser(userId, repoId);
    const pulls = await this.github.listPullRequests(
      installationId,
      repoFullName,
      { state, page, perPage },
    );

    return pulls.map((pr) => this.toPullRequestSummary(pr));
  }

  async getPullRequest(
    userId: string,
    repoId: string,
    prNumber: number,
  ): Promise<PullRequestDetailDto> {
    const { installationId, repoFullName } =
      await this.installations.resolveRepoForUser(userId, repoId);
    const pr = await this.github.getPullRequest(
      installationId,
      repoFullName,
      prNumber,
    );

    return {
      ...this.toPullRequestSummary(pr),
      body: pr.body ?? null,
      merged: Boolean(pr.merged),
      draft: Boolean(pr.draft),
    };
  }

  async getPullRequestDiff(
    userId: string,
    repoId: string,
    prNumber: number,
  ): Promise<ParsedDiff> {
    const { installationId, repoFullName } =
      await this.installations.resolveRepoForUser(userId, repoId);
    const raw = await this.github.getPullRequestDiff(
      installationId,
      repoFullName,
      prNumber,
    );
    console.log('raw', JSON.stringify(raw));
    return this.diffParser.parse(raw);
  }

  async getPullRequestFiles(
    userId: string,
    repoId: string,
    prNumber: number,
  ): Promise<FileDiff[]> {
    const { installationId, repoFullName } =
      await this.installations.resolveRepoForUser(userId, repoId);
    const raw = await this.github.getPullRequestDiff(
      installationId,
      repoFullName,
      prNumber,
    );
    const parsed = this.diffParser.parse(raw);
    return parsed.files.map(({ hunks: _hunks, ...file }) => ({
      ...file,
      hunks: [],
    }));
  }

  private toPullRequestSummary(pr: {
    number: number;
    title: string;
    state: string;
    user?: { login?: string | null } | null;
    head: { sha: string };
    base: { sha: string };
    created_at: string;
    updated_at: string;
    html_url: string;
  }): PullRequestSummaryDto {
    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      authorLogin: pr.user?.login ?? null,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      htmlUrl: pr.html_url,
    };
  }
}
