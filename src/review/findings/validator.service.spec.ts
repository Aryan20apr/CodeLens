import { ValidatePrFindingsService } from './validator.service';
import type { Finding } from '../../graph/state.types';
import type { ReviewChunk, FileIndexEntry } from '../../diff/types/review-chunk.types';
import type { AppConfig } from '../../config/app-config.types';
import type { Logger } from 'winston';

describe('ValidatePrFindingsService', () => {
  let service: ValidatePrFindingsService;
  let mockLogger: jest.Mocked<Partial<Logger>>;

  const mockAppConfig: AppConfig = {
    prReview: {
      findings: {
        maxInlineComments: 10,
        maxPerFile: 5,
        minConfidence: 'medium',
        allowedSeverities: ['critical', 'warning', 'info'],
      },
    },
  } as unknown as AppConfig;

  const mockFileIndex: FileIndexEntry[] = [
    {
      path: 'src/main/java/com/aryan/blogging/bloggingapis/security/JwtTokenHelper.java',
      previousPath: null,
      status: 'modified',
      additions: 10,
      deletions: 2,
    },
    {
      path: 'src/main/java/com/aryan/blogging/bloggingapis/config/SecurityConfig.java',
      previousPath: null,
      status: 'modified',
      additions: 20,
      deletions: 5,
    },
  ];

  const mockChunks: ReviewChunk[] = [
    {
      filePath:
        'src/main/java/com/aryan/blogging/bloggingapis/security/JwtTokenHelper.java',
      previousPath: null,
      fileStatus: 'modified',
      hunkHeader: '@@ -15,10 +15,12 @@',
      newLineRange: { start: 15, end: 26 },
      addedLines: [
        { line: 20, content: 'private String secret = "jwtTokenKey";' },
        { line: 21, content: 'public static final long JWT_TOKEN_VALIDITY = 5 * 60 * 60;' },
      ],
      deletedLineCount: 0,
    },
  ];

  beforeEach(() => {
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    service = new ValidatePrFindingsService(mockLogger as Logger, mockAppConfig);
  });

  it('validates finding on added line in diff with exact repository path', () => {
    const rawFindings: Finding[] = [
      {
        id: '1',
        filePath:
          'src/main/java/com/aryan/blogging/bloggingapis/security/JwtTokenHelper.java',
        category: 'security',
        severity: 'critical',
        title: 'Hardcoded JWT Secret',
        description: 'Secret is hardcoded in file',
        location: { startLine: 20, endLine: 20 },
        confidence: 'high',
      },
    ];

    const result = service.validate({
      rawFindings,
      analysisSummary: 'Review summary',
      chunks: mockChunks,
      fileIndex: mockFileIndex,
      crossFileHints: [],
      config: service.getDefaultConfig(),
    });

    expect(result.validatedFindings).toHaveLength(1);
    expect(result.validatedFindings[0].filePath).toBe(
      'src/main/java/com/aryan/blogging/bloggingapis/security/JwtTokenHelper.java',
    );
    expect(result.validationStats.validCount).toBe(1);
    expect(result.validationStats.droppedCount).toBe(0);
  });

  it('drops finding if cited line is not an added line in the diff', () => {
    const rawFindings: Finding[] = [
      {
        id: '1',
        filePath:
          'src/main/java/com/aryan/blogging/bloggingapis/security/JwtTokenHelper.java',
        category: 'security',
        severity: 'critical',
        title: 'Issue on unchanged line',
        description: 'Some issue',
        location: { startLine: 5, endLine: 5 }, // line 5 is not added
        confidence: 'high',
      },
    ];

    const result = service.validate({
      rawFindings,
      analysisSummary: 'Review summary',
      chunks: mockChunks,
      fileIndex: mockFileIndex,
      crossFileHints: [],
      config: service.getDefaultConfig(),
    });

    expect(result.validatedFindings).toHaveLength(0);
    expect(result.validationStats.dropReasons.line_not_in_diff).toBe(1);
  });

  it('drops finding if file is not in diff or hinted files', () => {
    const rawFindings: Finding[] = [
      {
        id: '1',
        filePath: 'src/main/java/com/aryan/blogging/bloggingapis/NonExistent.java',
        category: 'security',
        severity: 'critical',
        title: 'Unknown file',
        description: 'Some issue',
        location: { startLine: 20, endLine: 20 },
        confidence: 'high',
      },
    ];

    const result = service.validate({
      rawFindings,
      analysisSummary: 'Review summary',
      chunks: mockChunks,
      fileIndex: mockFileIndex,
      crossFileHints: [],
      config: service.getDefaultConfig(),
    });

    expect(result.validatedFindings).toHaveLength(0);
    expect(result.validationStats.dropReasons.cross_file_unsupported).toBe(1);
  });

  it('drops finding if confidence is lower than minConfidence', () => {
    const rawFindings: Finding[] = [
      {
        id: '1',
        filePath:
          'src/main/java/com/aryan/blogging/bloggingapis/security/JwtTokenHelper.java',
        category: 'security',
        severity: 'critical',
        title: 'Low confidence issue',
        description: 'Speculative issue',
        location: { startLine: 20, endLine: 20 },
        confidence: 'low',
      },
    ];

    const result = service.validate({
      rawFindings,
      analysisSummary: 'Review summary',
      chunks: mockChunks,
      fileIndex: mockFileIndex,
      crossFileHints: [],
      config: service.getDefaultConfig(),
    });

    expect(result.validatedFindings).toHaveLength(0);
    expect(result.validationStats.dropReasons.low_confidence).toBe(1);
  });
});
