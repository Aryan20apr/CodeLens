import { Injectable, UnauthorizedException, BadGatewayException, Logger } from '@nestjs/common';
import { LlmProvider } from '../../generated/prisma/client';

@Injectable()
export class ModelFetcherService {
  private readonly logger = new Logger(ModelFetcherService.name);

  async listModels(provider: LlmProvider, rawKey: string, nvidiaBaseUrl?: string): Promise<string[]> {
    try {
      switch (provider) {
        case LlmProvider.GEMINI:
          return await this.fetchGeminiModels(rawKey);
        case LlmProvider.OPENAI:
          return await this.fetchOpenAiModels(rawKey);
        case LlmProvider.GROQ:
          return await this.fetchGroqModels(rawKey);
        case LlmProvider.NVIDIA:
          return await this.fetchNvidiaModels(rawKey, nvidiaBaseUrl);
        default:
          return [];
      }
    } catch (error: any) {
      this.logger.error(`Failed to fetch models for ${provider}: ${error.message}`);
      if (error instanceof UnauthorizedException || error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException(`Could not reach ${provider}`);
    }
  }

  private async fetchGeminiModels(key: string): Promise<string[]> {
    const fallbackList = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-pro-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.status === 400 || res.status === 403) {
        throw new UnauthorizedException('Invalid Gemini API key');
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as any;
      if (!data.models) return fallbackList;

      const models = data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      
      return models.length > 0 ? models : fallbackList;
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      this.logger.warn(`Gemini live fetch failed, using fallback list: ${e.message}`);
      return fallbackList;
    }
  }

  private async fetchOpenAiModels(key: string): Promise<string[]> {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) throw new UnauthorizedException('Invalid OpenAI API key');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as any;
    return data.data
      .filter((m: any) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
      .map((m: any) => m.id)
      .sort();
  }

  private async fetchGroqModels(key: string): Promise<string[]> {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) throw new UnauthorizedException('Invalid Groq API key');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as any;
    return data.data.map((m: any) => m.id).sort();
  }

  private async fetchNvidiaModels(key: string, customBaseUrl?: string): Promise<string[]> {
    if (customBaseUrl) {
      // Clean trailing slashes
      const baseUrl = customBaseUrl.endsWith('/') ? customBaseUrl.slice(0, -1) : customBaseUrl;
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) throw new UnauthorizedException('Invalid NVIDIA API key for custom endpoint');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as any;
      return data.data.map((m: any) => m.id).sort();
    }

    // Static curated list for default NVIDIA NIM
    return [
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.1-8b-instruct',
      'nvidia/nemotron-4-340b-instruct',
      'mistralai/mixtral-8x7b-instruct-v0.1',
      'microsoft/phi-3-medium-128k-instruct',
    ];
  }
}
