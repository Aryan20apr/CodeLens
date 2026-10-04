import { LlmService } from './llm.service';
import type { AppConfig } from '../config/app-config.types';
import type { Logger } from 'winston';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGroq } from '@langchain/groq';

describe('LlmService (BYOK Model Resolution)', () => {
  let mockLogger: jest.Mocked<Partial<Logger>>;
  let mockConfig: AppConfig;

  beforeEach(() => {
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockConfig = {
      llm: {
        provider: 'gemini',
        googleGenerativeAiApiKey: 'system-gemini-key',
        googleApiKeyFallback: '',
        geminiModel: 'gemini-2.0-flash',
        nvidiaApiKey: 'system-nvidia-key',
        nvidiaModel: 'meta/llama-3.1-70b-instruct',
        nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1',
      },
    } as unknown as AppConfig;
  });

  it('resolves GEMINI user key to ChatGoogleGenerativeAI', () => {
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel({
      provider: 'GEMINI',
      rawKey: 'user-gemini-api-key',
      model: 'gemini-1.5-pro',
    });

    expect(model).toBeInstanceOf(ChatGoogleGenerativeAI);
    expect((model as any).model).toBe('gemini-1.5-pro');
  });

  it('resolves OPENAI user key to ChatOpenAI', () => {
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel({
      provider: 'OPENAI',
      rawKey: 'user-openai-api-key',
      model: 'gpt-4o-mini',
      baseUrl: 'https://custom-proxy.openai.com/v1',
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect((model as any).model).toBe('gpt-4o-mini');
  });

  it('resolves GROQ user key to ChatGroq', () => {
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel({
      provider: 'GROQ',
      rawKey: 'gsk-test-groq-key',
      model: 'llama3-70b-8192',
    });

    expect(model).toBeInstanceOf(ChatGroq);
    expect((model as any).model).toBe('llama3-70b-8192');
  });

  it('resolves NVIDIA user key to ChatOpenAI with custom baseURL', () => {
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel({
      provider: 'NVIDIA',
      rawKey: 'nvapi-test-nvidia-key',
      model: 'meta/llama-3.3-70b-instruct',
      baseUrl: 'https://custom.nvidia.proxy/v1',
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect((model as any).model).toBe('meta/llama-3.3-70b-instruct');
  });

  it('resolves NVIDIA user key defaulting to config.nvidiaBaseUrl when baseUrl is omitted', () => {
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel({
      provider: 'NVIDIA',
      rawKey: 'nvapi-test-nvidia-key',
      model: 'meta/llama-3.3-70b-instruct',
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect((model as any).model).toBe('meta/llama-3.3-70b-instruct');
  });

  it('falls back to system Gemini model when user key is undefined', () => {
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel(undefined);

    expect(model).toBeInstanceOf(ChatGoogleGenerativeAI);
    expect((model as any).model).toBe('gemini-2.0-flash');
  });

  it('falls back to system Nvidia model when provider is nvidia and user key is undefined', () => {
    mockConfig.llm.provider = 'nvidia';
    const service = new LlmService(mockLogger as Logger, mockConfig);

    const model = service.getChatModel(undefined);

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect((model as any).model).toBe('meta/llama-3.1-70b-instruct');
  });

  it('throws descriptive error if system gemini api key is missing', () => {
    mockConfig.llm.googleGenerativeAiApiKey = '';
    mockConfig.llm.googleApiKeyFallback = '';
    const service = new LlmService(mockLogger as Logger, mockConfig);

    expect(() => service.getChatModel(undefined)).toThrow(
      'GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_MODEL is not set',
    );
  });

  it('throws descriptive error if system nvidia api key is missing', () => {
    mockConfig.llm.provider = 'nvidia';
    mockConfig.llm.nvidiaApiKey = '';
    const service = new LlmService(mockLogger as Logger, mockConfig);

    expect(() => service.getChatModel(undefined)).toThrow(
      'NVIDIA_API_KEY is not set',
    );
  });
});
