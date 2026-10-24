import { PrFileEnrichmentService } from './pr-file-enrichment.service';
import type { GithubApiService } from '../../github/github-api.service';
import type { LanguageDetectService } from '../../graph/lib/language-detect.service';
import type { AstExtractService } from '../../graph/lib/ast-extract.service';
import type { Logger } from 'winston';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));

describe('PrFileEnrichmentService', () => {
  let service: PrFileEnrichmentService;
  let mockGithub: jest.Mocked<Partial<GithubApiService>>;
  let mockLanguage: jest.Mocked<Partial<LanguageDetectService>>;
  let mockAstExtract: jest.Mocked<Partial<AstExtractService>>;
  let mockLogger: jest.Mocked<Partial<Logger>>;

  beforeEach(() => {
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockGithub = {
      getFileContentAtRef: jest.fn(),
      getDirectoryAtRef: jest.fn(),
    };

    mockLanguage = {
      detectLanguage: jest.fn().mockReturnValue('typescript'),
    };

    mockAstExtract = {
      buildMetadata: jest.fn().mockResolvedValue({
        functions: [],
        classes: [],
        imports: [],
        functionCount: 0,
        classCount: 0,
      }),
    };

    service = new PrFileEnrichmentService(
      mockLogger as Logger,
      mockGithub as GithubApiService,
      mockLanguage as LanguageDetectService,
      mockAstExtract as AstExtractService,
    );
  });

  describe('enrich', () => {
    it('enriches files', async () => {
      mockGithub.getFileContentAtRef = jest
        .fn()
        .mockImplementation(async (_instId, _repo, path) => {
          if (path === 'src/index.ts') {
            return { content: 'export const a = 1;', sizeBytes: 20 };
          }
          return null;
        });
      mockGithub.getDirectoryAtRef = jest.fn().mockResolvedValue(null);

      const result = await service.enrich({
        installationId: 1n,
        repoFullName: 'owner/repo',
        headSha: 'head123',
        chunks: [
          {
            filePath: 'src/index.ts',
            previousPath: null,
            fileStatus: 'modified',
            hunkHeader: '@@ -1 +1 @@',
            newLineRange: { start: 1, end: 1 },
            addedLines: [{ line: 1, content: 'export const a = 1;' }],
            deletedLineCount: 0,
          },
        ],
      });

      expect(result.enrichedCount).toBe(1);
      expect(result.fileContexts[0].filePath).toBe('src/index.ts');
    });
  });
});
