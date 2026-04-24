import {
    Injectable,
    UnauthorizedException,
    ConflictException,
    Inject,
  } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  import * as bcrypt from 'bcrypt';
  import { uuidv7 } from 'uuidv7';
  import { PrismaService } from '../db/prisma.service';
  import { UserService } from '../user/user.service';
  import { encrypt } from '../common/utils/crypto.util';
  import { APP_CONFIG } from '../config/config.constants';
  import type { AppConfig } from '../config/app-config.types';
  import type { RegisterDto } from './dto/register.dto';
  
  @Injectable()
  export class AuthService {
    constructor(
      private prisma: PrismaService,
      private userService: UserService,
      private jwtService: JwtService,
      @Inject(APP_CONFIG) private config: AppConfig,
    ) {}
  
    // -------------------------------------------------------------------------
    // Email / password
    // -------------------------------------------------------------------------
  
    async register(dto: RegisterDto) {
      const { user, rawApiKey } = await this.userService.createLocal(dto);
      const tokens = await this.issueTokens(user);
      return { ...tokens, apiKey: rawApiKey };
    }
  
    async validateLocalUser(email: string, password: string) {
      const user = await this.userService.findByEmail(email);
      if (!user || !user.hashedPassword) return null;
  
      const valid = await bcrypt.compare(password, user.hashedPassword);
      return valid ? user : null;
    }
  
    async login(user: any) {
      return this.issueTokens(user);
    }
  
    // -------------------------------------------------------------------------
    // Refresh tokens
    // -------------------------------------------------------------------------
  
    async refreshTokens(userId: string, tokenId: string) {
      const user = await this.userService.findById(userId);
      if (!user) throw new UnauthorizedException();
  
      // Rotate: revoke the used token, issue a new pair
      await this.revokeRefreshToken(tokenId);
      return this.issueTokens(user);
    }
  
    async validateRefreshToken(userId: string, tokenId: string) {
      const token = await this.prisma.refreshToken.findUnique({
        where: { id: tokenId },
      });
  
      if (
        !token ||
        token.userId !== userId ||
        token.revokedAt ||
        token.expiresAt < new Date()
      ) {
        return null;
      }
  
      return this.userService.findById(userId);
    }
  
    async revokeRefreshToken(tokenId: string) {
      await this.prisma.refreshToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });
    }
  
    async logout(tokenId: string) {
      await this.revokeRefreshToken(tokenId);
    }
  
    // -------------------------------------------------------------------------
    // OAuth
    // -------------------------------------------------------------------------
  
    async findOrCreateOAuthUser(data: {
      provider: 'GITHUB' | 'GOOGLE';
      providerUid: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      accessToken: string;
      refreshToken: string | null;
    }) {
      const encKey = this.config.auth.encryptionKey;
  
      const user = await this.userService.findOrCreateByOAuth({
        provider: data.provider,
        providerUid: data.providerUid,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
        encryptedAccessToken: encrypt(data.accessToken, encKey),
        encryptedRefreshToken: data.refreshToken
          ? encrypt(data.refreshToken, encKey)
          : null,
        tokenExpiry: null,
      });
  
      return user;
    }
  
    async oauthLogin(user: any) {
      return this.issueTokens(user);
    }
  
    // -------------------------------------------------------------------------
    // Token factory
    // -------------------------------------------------------------------------
  
    private async issueTokens(user: any) {
      const tokenId = uuidv7();
      const refreshExpiresIn = this.config.auth.jwtRefreshExpiresIn;

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(
          { sub: user.id, email: user.email, role: user.role, type: 'access' },
          {
            secret: this.config.auth.jwtAccessSecret,
            expiresIn: this.config.auth.jwtAccessExpiresIn,
          },
        ),
        this.jwtService.signAsync(
          { sub: user.id, tokenId, type: 'refresh' },
          {
            secret: this.config.auth.jwtRefreshSecret,
            expiresIn: refreshExpiresIn,
          },
        ),
      ]);
  
      // Persist a hashed record so we can revoke individual tokens
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // mirrors JWT_REFRESH_EXPIRES_IN
  
      await this.prisma.refreshToken.create({
        data: {
          id: tokenId,
          tokenHash: await bcrypt.hash(refreshToken, 10),
          userId: user.id,
          expiresAt,
        },
      });
  
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
      };
    }
  }