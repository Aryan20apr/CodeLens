import { Injectable, Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { encrypt, decrypt } from '../common/utils/crypto.util';
import { APP_CONFIG } from '../config/config.constants';
import type { AppConfig } from '../config/app-config.types';
import { ModelFetcherService } from './model-fetcher.service';
import { LlmProvider } from '../../generated/prisma/client';

export interface UserLlmKey {
  provider: LlmProvider;
  rawKey: string;
  model?: string;
  baseUrl?: string | null;
}

@Injectable()
export class LlmProviderService {
  constructor(
    private prisma: PrismaService,
    private modelFetcher: ModelFetcherService,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) { }

  async saveKey(userId: string, provider: LlmProvider, rawKey: string, baseUrl?: string) {
    // 1. Validate key and fetch models
    const models = await this.modelFetcher.listModels(provider, rawKey, baseUrl);

    // 2. Encrypt key
    const encryptedKey = encrypt(rawKey, this.config.auth.encryptionKey);
    const maskedKey = `sk-...${rawKey.slice(-4)}`;

    // 3. Upsert DB
    await this.prisma.llmApiKey.upsert({
      where: {
        userId_provider: { userId, provider },
      },
      update: {
        encryptedKey,
        maskedKey,
        baseUrl: baseUrl || null,
      },
      create: {
        userId,
        provider,
        encryptedKey,
        maskedKey,
        baseUrl: baseUrl || null,
      },
    });

    return { maskedKey, models };
  }

  async deleteKey(userId: string, provider: LlmProvider) {
    await this.prisma.llmApiKey.deleteMany({
      where: { userId, provider },
    });
  }

  async listModelsForProvider(userId: string, provider: LlmProvider): Promise<string[]> {
    const keyRecord = await this.prisma.llmApiKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!keyRecord) {
      throw new UnauthorizedException('No key saved for this provider');
    }
    const rawKey = decrypt(keyRecord.encryptedKey, this.config.auth.encryptionKey);
    return this.modelFetcher.listModels(provider, rawKey, keyRecord.baseUrl || undefined);
  }

  async getStoredKeys(userId: string) {
    const keys = await this.prisma.llmApiKey.findMany({
      where: { userId },
      select: {
        provider: true,
        maskedKey: true,
        updatedAt: true,
        baseUrl: true,
      },
    });
    return keys;
  }

  async setActive(userId: string, provider: LlmProvider, model: string) {
    await this.prisma.userPreferences.upsert({
      where: { userId },
      update: {
        activeProvider: provider,
        activeModel: model,
      },
      create: {
        userId,
        activeProvider: provider,
        activeModel: model,
      },
    });
  }

  async getActive(userId: string) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { activeProvider: true, activeModel: true },
    });
    if (!prefs?.activeProvider || !prefs?.activeModel) {
      return null;
    }
    return { provider: prefs.activeProvider, model: prefs.activeModel };
  }

  /**
   * Internal use only (Processors/Graph).
   * Decrypts and returns the raw key for the specified provider, or the active provider if not specified.
   */
  async getRawKey(userId: string, providerOverride?: LlmProvider): Promise<UserLlmKey | null> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    const targetProvider = providerOverride || prefs?.activeProvider;
    if (!targetProvider) return null;

    const keyRecord = await this.prisma.llmApiKey.findUnique({
      where: {
        userId_provider: { userId, provider: targetProvider },
      },
    });

    if (!keyRecord) return null;

    const rawKey = decrypt(keyRecord.encryptedKey, this.config.auth.encryptionKey);

    return {
      provider: keyRecord.provider,
      rawKey,
      model: targetProvider === prefs?.activeProvider ? prefs?.activeModel || undefined : undefined,
      baseUrl: keyRecord.baseUrl,
    };
  }
}
