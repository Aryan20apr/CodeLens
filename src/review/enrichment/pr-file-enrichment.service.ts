import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { ReviewChunk } from '../../diff/types/review-chunk.types';
import { AstExtractService } from '../../graph/lib/ast-extract.service';
import { LanguageDetectService } from '../../graph/lib/language-detect.service';
import { GithubApiService } from '../../github/github-api.service';
import { mapAddedLinesToSymbols } from './map-added-lines-to-symbols.util';
import type {
  PrFileContext,
  PrFileEnrichmentInput,
  PrFileEnrichmentResult,
  PrFileEnrichSkipReason,
  RepoSkill,
} from '../types/pr-file-enrichment.types';

export const MAX_ENRICH_FILES = 50;
export const MAX_FILE_BYTES = 512_000;
export const ENRICH_CONCURRENCY = 5;

@Injectable()
export class PrFileEnrichmentService {
  private static readonly RULE_FILE_CANDIDATES = [
    'AGENTS.md',
    '.agents/AGENTS.md',
    '.codelens/AGENTS.md',
    '.github/copilot-instructions.md',
  ];

  private static readonly SKILL_DIR_CANDIDATES = [
    '.codelens/skills',
    '.github/skills',
  ];

  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    private readonly github: GithubApiService,
    private readonly language: LanguageDetectService,
    private readonly astExtract: AstExtractService,
  ) {
    this.logger = logger.child({ context: PrFileEnrichmentService.name });
  }

  async enrich(input: PrFileEnrichmentInput): Promise<PrFileEnrichmentResult> {
    const className = PrFileEnrichmentService.name;
    const methodName = 'enrich';

    const paths = this.uniqueFilePaths(input.chunks).slice(0, MAX_ENRICH_FILES);
    const addedLinesByPath = this.collectAddedLinesByPath(input.chunks);

    this.logger.info(
      `[${className}] [${methodName}] :: Starting file enrichment`,
      {
        repoFullName: input.repoFullName,
        headSha: input.headSha,
        fileCount: paths.length,
      },
    );

    // Run repository rules and skills fetching in parallel with file AST enrichment
    const [rulesResult, skillsResult] = await Promise.all([
      this.fetchRepoRules(
        input.installationId,
        input.repoFullName,
        input.headSha,
      ),
      this.fetchRepoSkills(
        input.installationId,
        input.repoFullName,
        input.headSha,
      ),
    ]);

    const fileContexts: PrFileContext[] = [];
    let enrichedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < paths.length; i += ENRICH_CONCURRENCY) {
      const batch = paths.slice(i, i + ENRICH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((filePath) =>
          this.enrichOneFile(
            input.installationId,
            input.repoFullName,
            input.headSha,
            filePath,
            addedLinesByPath.get(filePath) ?? [],
          ),
        ),
      );
      for (const ctx of batchResults) {
        fileContexts.push(ctx);
        if (ctx.fetchStatus === 'ok') enrichedCount += 1;
        else if (ctx.fetchStatus === 'skipped') skippedCount += 1;
        else failedCount += 1;
      }
    }

    this.logger.info(
      `[${className}] [${methodName}] :: File enrichment complete`,
      {
        repoFullName: input.repoFullName,
        enrichedCount,
        skippedCount,
        failedCount,
        hasRepoRules: !!rulesResult,
        repoSkillCount: skillsResult.length,
      },
    );

    return {
      fileContexts,
      enrichedCount,
      skippedCount,
      failedCount,
      repoRules: rulesResult,
      repoSkills: skillsResult,
    };
  }

  async fetchRepoRules(
    installationId: bigint,
    repoFullName: string,
    headSha: string,
  ): Promise<string | null> {
    const className = PrFileEnrichmentService.name;
    const methodName = 'fetchRepoRules';

    for (const candidate of PrFileEnrichmentService.RULE_FILE_CANDIDATES) {
      try {
        const file = await this.github.getFileContentAtRef(
          installationId,
          repoFullName,
          candidate,
          headSha,
        );
        if (file && file.content.trim()) {
          this.logger.info(
            `[${className}] [${methodName}] :: Found repository rules in ${candidate}`,
            { repoFullName, headSha, candidate, sizeBytes: file.sizeBytes },
          );
          return file.content;
        }
      } catch (_err) {
        this.logger.debug(
          `[${className}] [${methodName}] :: Candidate rule file not found: ${candidate}`,
        );
      }
    }

    return null;
  }

  async fetchRepoSkills(
    installationId: bigint,
    repoFullName: string,
    headSha: string,
  ): Promise<RepoSkill[]> {
    const className = PrFileEnrichmentService.name;
    const methodName = 'fetchRepoSkills';

    const repoSkills: RepoSkill[] = [];

    for (const dirCandidate of PrFileEnrichmentService.SKILL_DIR_CANDIDATES) {
      try {
        const dirEntries = await this.github.getDirectoryAtRef(
          installationId,
          repoFullName,
          dirCandidate,
          headSha,
        );
        if (!dirEntries || dirEntries.length === 0) continue;

        for (const entry of dirEntries) {
          if (entry.type === 'dir') {
            const skillFilePath = `${entry.path}/SKILL.md`;
            const skillFile = await this.github.getFileContentAtRef(
              installationId,
              repoFullName,
              skillFilePath,
              headSha,
            );
            if (skillFile && skillFile.content.trim()) {
              const match = skillFile.content.match(
                /^---\s*\nname:\s*([\w-]+)/,
              );
              const skillName = match ? match[1] : entry.name;
              repoSkills.push({
                name: skillName,
                path: entry.path,
                content: skillFile.content,
              });
              this.logger.info(
                `[${className}] [${methodName}] :: Discovered custom repo skill: ${skillName}`,
                { repoFullName, headSha, skillFilePath },
              );
            }
          }
        }
      } catch (_err) {
        this.logger.debug(
          `[${className}] [${methodName}] :: Candidate skill dir failed: ${dirCandidate}`,
        );
      }
    }

    return repoSkills;
  }

  private uniqueFilePaths(chunks: ReviewChunk[]): string[] {
    return [...new Set(chunks.map((c) => c.filePath))];
  }

  private collectAddedLinesByPath(
    chunks: ReviewChunk[],
  ): Map<string, number[]> {
    const map = new Map<string, Set<number>>();
    for (const chunk of chunks) {
      let set = map.get(chunk.filePath);
      if (!set) {
        set = new Set();
        map.set(chunk.filePath, set);
      }
      for (const line of chunk.addedLines) {
        set.add(line.line);
      }
    }
    const result = new Map<string, number[]>();
    for (const [path, lines] of map) {
      result.set(
        path,
        [...lines].sort((a, b) => a - b),
      );
    }
    return result;
  }

  private async enrichOneFile(
    installationId: bigint,
    repoFullName: string,
    headSha: string,
    filePath: string,
    addedLines: number[],
  ): Promise<PrFileContext> {
    const className = PrFileEnrichmentService.name;
    const methodName = 'enrichOneFile';

    const fetched = await this.github.getFileContentAtRef(
      installationId,
      repoFullName,
      filePath,
      headSha,
    );

    if (!fetched) {
      return this.skippedContext(
        filePath,
        'unknown',
        'failed',
        'not_found',
        addedLines,
      );
    }

    if (fetched.sizeBytes > MAX_FILE_BYTES) {
      return this.skippedContext(
        filePath,
        'unknown',
        'skipped',
        'file_too_large',
        addedLines,
      );
    }

    const detected = this.language.detectLanguage(fetched.content, filePath);
    if (detected === 'unknown') {
      return this.skippedContext(
        filePath,
        detected,
        'skipped',
        'unsupported_language',
        addedLines,
      );
    }

    try {
      const metadata = await this.astExtract.buildMetadata(
        fetched.content,
        detected,
      );
      const addedLineSymbols = mapAddedLinesToSymbols(
        addedLines,
        metadata.functions,
        metadata.classes,
      );

      this.logger.debug(`[${className}] [${methodName}] :: Enriched file`, {
        filePath,
        language: detected,
        functionCount: metadata.functionCount,
      });

      return {
        filePath,
        language: detected,
        fetchStatus: 'ok',
        metadata,
        addedLineSymbols,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      this.logger.warn(
        `[${className}] [${methodName}] :: AST enrichment failed`,
        { filePath, errorMessage, errorStack },
      );
      return this.skippedContext(
        filePath,
        detected,
        'failed',
        'ast_error',
        addedLines,
      );
    }
  }

  private skippedContext(
    filePath: string,
    language: string,
    fetchStatus: 'skipped' | 'failed',
    skipReason: PrFileEnrichSkipReason,
    addedLines: number[],
  ): PrFileContext {
    return {
      filePath,
      language,
      fetchStatus,
      skipReason,
      metadata: null,
      addedLineSymbols: addedLines.map((line) => ({
        line,
        symbolKind: null,
        symbolName: null,
      })),
    };
  }
}
