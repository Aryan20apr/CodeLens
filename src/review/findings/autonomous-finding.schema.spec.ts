import {
  createScopedAutonomousReviewOutputSchema,
  createScopedCandidateFindingSchema,
  createScopedCandidateFindingsListSchema,
} from './autonomous-finding.schema';

describe('autonomous-finding.schema scoped path validation', () => {
  const allowedPaths = [
    'src/main/java/com/aryan/blogging/bloggingapis/services/UserServiceImpl.java',
    'src/main/java/com/aryan/blogging/bloggingapis/controllers/UserController.java',
  ];

  it('accepts findings with file paths matching the allowed PR files', () => {
    const schema = createScopedCandidateFindingSchema(allowedPaths);
    const validFinding = {
      filePath:
        'src/main/java/com/aryan/blogging/bloggingapis/services/UserServiceImpl.java',
      category: 'security',
      severity: 'critical',
      title: 'Insecure Password Storage',
      description: 'Passwords stored in plaintext without BCrypt hashing.',
      location: { startLine: 45, endLine: 50 },
      confidence: 'high',
    };

    const parsed = schema.parse(validFinding);
    expect(parsed.filePath).toBe(
      'src/main/java/com/aryan/blogging/bloggingapis/services/UserServiceImpl.java',
    );
  });

  it('rejects hallucinated boilerplate file paths not in allowed PR files', () => {
    const schema = createScopedCandidateFindingSchema(allowedPaths);
    const hallucinatedFinding = {
      filePath:
        'src/main/java/com/example/bloggingapis/service/UserServiceImpl.java',
      category: 'security',
      severity: 'critical',
      title: 'Insecure Password Storage',
      description: 'Passwords stored in plaintext without BCrypt hashing.',
      location: { startLine: 45, endLine: 50 },
      confidence: 'high',
    };

    expect(() => schema.parse(hallucinatedFinding)).toThrow();
  });

  it('scopes candidate findings list schema to allowed PR files', () => {
    const listSchema = createScopedCandidateFindingsListSchema(allowedPaths);
    const validList = {
      thoughtProcess: 'Checked authentication implementation.',
      candidateFindings: [
        {
          filePath:
            'src/main/java/com/aryan/blogging/bloggingapis/controllers/UserController.java',
          category: 'correctness',
          severity: 'warning',
          title: 'Missing Null Check',
          description: 'userDto could be null before processing.',
          location: { startLine: 20, endLine: 22 },
          confidence: 'high',
        },
      ],
    };

    const parsed = listSchema.parse(validList);
    expect(parsed.candidateFindings).toHaveLength(1);

    const invalidList = {
      candidateFindings: [
        {
          filePath: 'src/main/java/com/unknown/Foo.java',
          category: 'correctness',
          severity: 'warning',
          title: 'Invalid path test',
          description: 'Testing path validation rejection',
          location: { startLine: 1, endLine: 2 },
          confidence: 'high',
        },
      ],
    };

    expect(() => listSchema.parse(invalidList)).toThrow();
  });

  it('scopes autonomous review output schema and allows valid findings', () => {
    const outputSchema = createScopedAutonomousReviewOutputSchema(allowedPaths);
    const validOutput = {
      summary: 'Thorough review of blogging APIs authentication changes.',
      findings: [
        {
          filePath:
            'src/main/java/com/aryan/blogging/bloggingapis/services/UserServiceImpl.java',
          category: 'security',
          severity: 'critical',
          title: 'Plaintext Password',
          description: 'Passowrd hashing omitted in user creation flow.',
          location: { startLine: 10, endLine: 15 },
          confidence: 'high',
        },
      ],
    };

    const parsed = outputSchema.parse(validOutput);
    expect(parsed.findings).toHaveLength(1);
  });

  it('normalizes backslashes, trims, and deduplicates allowed paths', () => {
    const dirtyPaths = [
      'src\\main\\java\\App.java  ',
      'src/main/java/App.java',
      '',
      '   ',
    ];
    const schema = createScopedCandidateFindingSchema(dirtyPaths);

    const parsed = schema.parse({
      filePath: 'src/main/java/App.java',
      category: 'performance',
      severity: 'info',
      title: 'String concat in loop',
      description: 'Consider using StringBuilder.',
      location: { startLine: 1, endLine: 2 },
      confidence: 'medium',
    });

    expect(parsed.filePath).toBe('src/main/java/App.java');
  });

  it('falls back to string schema when allowedFilePaths is empty or undefined', () => {
    const schema = createScopedCandidateFindingSchema([]);
    const parsed = schema.parse({
      filePath: 'any/arbitrary/path.ts',
      category: 'best_practices',
      severity: 'info',
      title: 'Arbitrary path accepted',
      description: 'When no allowed paths are given, open string is accepted.',
      location: { startLine: 1, endLine: 2 },
      confidence: 'low',
    });

    expect(parsed.filePath).toBe('any/arbitrary/path.ts');
  });
});
