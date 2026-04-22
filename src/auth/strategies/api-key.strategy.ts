import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { UserService } from '../../user/user.service';
import type { FastifyRequest } from 'fastify';
import * as bcrypt from 'bcrypt';

/**
 * Accepts `Authorization: Bearer <apiKey>` on routes that opt in
 * (API key and JWT share the same header; we try JWT first via JwtAuthGuard,
 * and fall back to this strategy for programmatic clients that pass an API key).
 *
 * In practice, routes that accept both are protected by the composite
 * `AnyAuthGuard` — or simply the `JwtAuthGuard` which, when
 * JWT verification fails, this strategy is tried.
 *
 * Uses a dedicated `@ApiKey()` guard on CLI/webhook
 * routes to make the intent explicit.
 */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private userService: UserService) {
    super();
  }

  async validate(request: FastifyRequest) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing API key');
    }

    const rawKey = authHeader.slice(7);
    const user = await this.userService.findByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');

    return user;
  }
}