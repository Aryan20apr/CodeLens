import { Injectable, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../db/prisma.service';
import * as bcrypt from 'bcrypt';
import { uuidv7 } from 'uuidv7';

const BCRYPT_ROUNDS = 12;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { oauthAccounts: true, preferences: true },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Used by ApiKeyStrategy — O(1) lookup on indexed apiKeyHash (SHA-256 hex). */
  async findByApiKey(rawKey: string) {
    return this.prisma.user.findUnique({
      where: { apiKeyHash: sha256Hex(rawKey) },
    });
  }

  async createLocal(data: {
    email: string;
    password: string;
    name?: string;
  }) {
    const existing = await this.findByEmail(data.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const rawKey = uuidv7();

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        hashedPassword,
        apiKeyHash: sha256Hex(rawKey),
        preferences: { create: {} },
      },
    });

    return { user, rawApiKey: rawKey };
  }

  async regenerateApiKey(userId: string) {
    const rawKey = uuidv7();

    await this.prisma.user.update({
      where: { id: userId },
      data: { apiKeyHash: sha256Hex(rawKey) },
    });

    return rawKey;
  }

  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async findOrCreateByOAuth(data: {
    provider: 'GITHUB' | 'GOOGLE';
    providerUid: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string | null;
    tokenExpiry: Date | null;
  }) {
    // Try to find an existing OAuth account for this provider + uid
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUid: {
          provider: data.provider,
          providerUid: data.providerUid,
        },
      },
      include: { user: true },
    });

    if (existing) {
      // Update the stored token (may have rotated)
      await this.prisma.oAuthAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: data.encryptedAccessToken,
          refreshToken: data.encryptedRefreshToken,
          tokenExpiry: data.tokenExpiry,
        },
      });
      return existing.user;
    }

    // Check if a user with this email already exists (link accounts)
    const byEmail = await this.findByEmail(data.email);
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: {
          provider: data.provider,
          providerUid: data.providerUid,
          accessToken: data.encryptedAccessToken,
          refreshToken: data.encryptedRefreshToken,
          tokenExpiry: data.tokenExpiry,
          userId: byEmail.id,
        },
      });
      return byEmail;
    }

    // Brand new user
    const rawKey = uuidv7();

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
        apiKeyHash: sha256Hex(rawKey),
        oauthAccounts: {
          create: {
            provider: data.provider,
            providerUid: data.providerUid,
            accessToken: data.encryptedAccessToken,
            refreshToken: data.encryptedRefreshToken,
            tokenExpiry: data.tokenExpiry,
          },
        },
        preferences: { create: {} },
      },
    });

    return user;
  }
}
