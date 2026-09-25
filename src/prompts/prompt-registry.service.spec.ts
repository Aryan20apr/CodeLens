import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { PromptRegistryService } from './prompt-registry.service';

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

describe('PromptRegistryService', () => {
  let service: PromptRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptRegistryService,
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<PromptRegistryService>(PromptRegistryService);
  });

  it('should find registered prompts by ID and resolve the latest version', () => {
    const prompt = service.get('pr-review.triage');
    expect(prompt).toBeDefined();
    expect(prompt.id).toBe('pr-review.triage');
    expect(prompt.version).toBe('1.0.0');
  });

  it('should throw an error for unknown prompt IDs', () => {
    expect(() => service.get('unknown.id' as any)).toThrow(
      /Prompt with id 'unknown.id' not found/,
    );
  });

  it('should render a prompt with LangSmith tags and metadata', () => {
    const rendered = service.render(
      'pr-review.specialized',
      { role: 'security', skipSearchTools: true },
      { provider: 'OPENAI' },
    );

    expect(rendered.systemPrompt).toContain('senior application security engineer');
    expect(rendered.langchainMetadata.tags).toContain('prompt:pr-review.specialized');
    expect(rendered.langchainMetadata.tags).toContain('v:1.0.0');
    expect(rendered.langchainMetadata.tags).toContain('provider:OPENAI');
    expect(rendered.langchainMetadata.metadata.promptId).toBe('pr-review.specialized');
    expect(rendered.langchainMetadata.metadata.promptVersion).toBe('1.0.0');
    expect(rendered.langchainMetadata.metadata.provider).toBe('OPENAI');
  });

  it('should apply provider overrides when rendering if configured', () => {
    const rendered = service.render(
      'pr-review.specialized',
      { role: 'security', skipSearchTools: true },
      { provider: 'GROQ' },
    );

    expect(rendered.systemPrompt).toContain('Do not wrap in triple backticks or markdown');
    expect(rendered.langchainMetadata.tags).toContain('provider:GROQ');
  });

  it('should list all available prompt metadata in catalog', () => {
    const list = service.list();
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(list.map((p) => p.id)).toContain('snippet.analysis');
  });
});
