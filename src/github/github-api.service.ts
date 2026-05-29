import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { GithubAppAuthService } from './github-app-auth.service';

export const MAX_DIFF_CHARS = 200_000;

export type RepoCoords = { owner: string; repo: string };

export type PullRequestChangedFile = {
  path: string;
  previousPath: string | null;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied';
  additions: number;
  deletions: number;
};

@Injectable()
export class GithubApiService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly auth: GithubAppAuthService,
  ) {
    this.logger = logger.child({ context: GithubApiService.name });
  }

  parseRepoFullName(repoFullName: string): RepoCoords {
    const slash = repoFullName.indexOf('/');
    if (slash <= 0) {
      throw new Error(`Invalid repo full name: ${repoFullName}`);
    }
    return {
      owner: repoFullName.slice(0, slash),
      repo: repoFullName.slice(slash + 1),
    };
  }

  async getPullRequest(
    installationId: bigint,
    repoFullName: string,
    prNumber: number,
  ) {
    const className = GithubApiService.name;
    const methodName = 'getPullRequest';

    this.logger.info(`[${className}] [${methodName}] :: Fetching pull request`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
    });

    const octokit = this.auth.getInstallationOctokit(installationId);
    const { owner, repo } = this.parseRepoFullName(repoFullName);
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    this.logger.info(`[${className}] [${methodName}] :: Pull request fetched`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
    });

    return data;
  }

  async getPullRequestDiff(
    installationId: bigint,
    repoFullName: string,
    prNumber: number,
  ): Promise<string> {
    const className = GithubApiService.name;
    const methodName = 'getPullRequestDiff';

    this.logger.info(`[${className}] [${methodName}] :: Fetching pull request diff`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
    });

    const octokit = this.auth.getInstallationOctokit(installationId);
    const { owner, repo } = this.parseRepoFullName(repoFullName);

    const diff = await octokit.request({
      method: 'GET',
      url: '/repos/{owner}/{repo}/pulls/{pull_number}',
      owner,
      repo,
      pull_number: prNumber,
      headers: { accept: 'application/vnd.github.v3.diff' },
    });

    let text =
      typeof diff.data === 'string' ? diff.data : String(diff.data ?? '');

    if (text.length <= MAX_DIFF_CHARS) {
      this.logger.info(`[${className}] [${methodName}] :: Diff fetched`, {
        installationId: String(installationId),
        repoFullName,
        prNumber,
        diffChars: text.length,
      });
      return text;
    }

    this.logger.warn(`[${className}] [${methodName}] :: Diff exceeds limit, falling back to file patches`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
      diffChars: text.length,
      maxDiffChars: MAX_DIFF_CHARS,
    });

    const files = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    const patches = files.data
      .map((f: { filename: string; patch?: string | null }) =>
        `--- ${f.filename}\n${f.patch ?? ''}`,
      )
      .join('\n\n');
    text = patches || text;

    if (text.length > MAX_DIFF_CHARS) {
      this.logger.warn(`[${className}] [${methodName}] :: Truncating diff for review`, {
        installationId: String(installationId),
        repoFullName,
        prNumber,
        diffChars: text.length,
        maxDiffChars: MAX_DIFF_CHARS,
      });
      return (
        text.slice(0, MAX_DIFF_CHARS) +
        `\n\n[Diff truncated at ${MAX_DIFF_CHARS} characters for review.]`
      );
    }

    this.logger.info(`[${className}] [${methodName}] :: Diff assembled from file patches`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
      diffChars: text.length,
    });

    return text;
  }

  async createPullRequestReview(
    installationId: bigint,
    repoFullName: string,
    prNumber: number,
    body: string,
  ): Promise<bigint> {
    const className = GithubApiService.name;
    const methodName = 'createPullRequestReview';

    this.logger.info(`[${className}] [${methodName}] :: Posting pull request review`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
      bodyChars: body.length,
    });

    const octokit = this.auth.getInstallationOctokit(installationId);
    const { owner, repo } = this.parseRepoFullName(repoFullName);
    const { data } = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      event: 'COMMENT',
      body,
    });

    this.logger.info(`[${className}] [${methodName}] :: Pull request review posted`, {
      installationId: String(installationId),
      repoFullName,
      prNumber,
      githubReviewId: String(data.id),
    });

    return BigInt(data.id);
  }

  async listPullRequests(
    installationId: bigint,
    repoFullName: string,
    options: {
      state?: 'open' | 'closed' | 'all';
      page?: number;
      perPage?: number;
    } = {},
  ) {
    const className = GithubApiService.name;
    const methodName = 'listPullRequests';
    const { state = 'open', page = 1, perPage = 30 } = options;

    this.logger.info(`[${className}] [${methodName}] :: Listing pull requests`, {
      installationId: String(installationId),
      repoFullName,
      state,
      page,
      perPage,
    });

    const octokit = this.auth.getInstallationOctokit(installationId);
    const { owner, repo } = this.parseRepoFullName(repoFullName);
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state,
      page,
      per_page: perPage,
    });

    return data;
  }

  async listInstallationRepositories(installationId: bigint) {
    const className = GithubApiService.name;
    const methodName = 'listInstallationRepositories';

    this.logger.info(
      `[${className}] [${methodName}] :: Listing installation repositories`,
      { installationId: String(installationId) },
    );

    const octokit = this.auth.getInstallationOctokit(installationId);
    const repos: Array<{ id: number; full_name: string; private?: boolean }> =
      [];
    let page = 1;
    const perPage = 100;

    for (;;) {
      const { data } = await octokit.apps.listReposAccessibleToInstallation({
        per_page: perPage,
        page,
      });
      for (const r of data.repositories) {
        repos.push({
          id: r.id,
          full_name: r.full_name,
          private: r.private,
        });
      }
      if (data.repositories.length < perPage) break;
      page += 1;
    }

    this.logger.info(
      `[${className}] [${methodName}] :: Installation repositories listed`,
      {
        installationId: String(installationId),
        repoCount: repos.length,
      },
    );

    return repos;
  }

  async listPullRequestFiles(
    installationId: bigint,
    repoFullName: string,
    prNumber: number,
  ) {
    const octokit = this.auth.getInstallationOctokit(installationId);
    const { owner, repo } = this.parseRepoFullName(repoFullName);
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return data;
  }

  async listPullRequestChangedFiles(
    installationId: bigint,
    repoFullName: string,
    prNumber: number,
  ): Promise<PullRequestChangedFile[]> {
    const className = GithubApiService.name;
    const methodName = 'listPullRequestChangedFiles';

    this.logger.info(
      `[${className}] [${methodName}] :: Listing pull request changed files`,
      {
        installationId: String(installationId),
        repoFullName,
        prNumber,
      },
    );

    const files = await this.listPullRequestFiles(
      installationId,
      repoFullName,
      prNumber,
    );

    const mapped = files.map((f) => ({
      path: f.filename,
      previousPath: f.previous_filename ?? null,
      status: this.mapGithubFileStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
    }));

    this.logger.info(
      `[${className}] [${methodName}] :: Pull request changed files listed`,
      {
        installationId: String(installationId),
        repoFullName,
        prNumber,
        fileCount: mapped.length,
      },
    );

    return mapped;
  }

  private mapGithubFileStatus(
    status: string,
  ): PullRequestChangedFile['status'] {
    switch (status) {
      case 'added':
        return 'added';
      case 'removed':
        return 'removed';
      case 'renamed':
        return 'renamed';
      case 'copied':
        return 'copied';
      case 'changed':
      case 'modified':
        return 'modified';
      default:
        return 'modified';
    }
  }
}
