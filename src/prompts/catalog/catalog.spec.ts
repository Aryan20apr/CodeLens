import { PROMPT_CATALOG } from './index';

describe('Prompt Catalog', () => {
  it('should contain all required prompt definitions with valid metadata and semver', () => {
    const expectedIds = [
      'pr-review.triage',
      'pr-review.specialized',
      'pr-review.single',
      'pr-review.synthesize',
      'snippet.analysis',
      'snippet.refine',
    ];

    expect(PROMPT_CATALOG.length).toBeGreaterThanOrEqual(expectedIds.length);

    for (const id of expectedIds) {
      const prompt = PROMPT_CATALOG.find((p) => p.id === id);
      expect(prompt).toBeDefined();
      expect(prompt!.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(prompt!.description.length).toBeGreaterThan(10);
      expect(prompt!.tags.length).toBeGreaterThan(0);
    }
  });

  it('should render specialized prompts with role-specific constraints', () => {
    const specialized = PROMPT_CATALOG.find(
      (p) => p.id === 'pr-review.specialized',
    );
    expect(specialized).toBeDefined();

    const rendered = specialized!.render({
      role: 'security',
      skipSearchTools: false,
    });

    expect(rendered.systemPrompt).toContain(
      'senior application security engineer',
    );
    expect(rendered.systemPrompt).toContain(
      'findings[].category MUST be "security"',
    );
    expect(rendered.systemPrompt).toContain('search_symbol_usage');
  });

  it('should apply GROQ anti-fencing provider overrides when rendering', () => {
    const specialized = PROMPT_CATALOG.find(
      (p) => p.id === 'pr-review.specialized',
    );
    expect(specialized?.providerOverrides?.GROQ).toBeDefined();

    const rendered = specialized!.providerOverrides!.GROQ!({
      role: 'performance',
      skipSearchTools: true,
    });

    expect(rendered.systemPrompt).toContain(
      'Do not wrap in triple backticks or markdown',
    );
    expect(rendered.systemPrompt).toContain(
      'findings[].category MUST be "performance"',
    );
  });
});
