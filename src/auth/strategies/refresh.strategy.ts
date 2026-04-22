import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import type { AppConfig } from '../../config/app-config.types';

export interface JwtRefreshPayload {
  sub: string;
  tokenId: string;
  type: 'refresh';
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('auth.jwtRefreshSecret', { infer: true }),
      passReqToCallback: true,
    });
  }

  async validate(_req: any, payload: JwtRefreshPayload) {
    if (payload.type !== 'refresh') throw new UnauthorizedException();
    const user = await this.authService.validateRefreshToken(payload.sub, payload.tokenId);
    if (!user) throw new UnauthorizedException('Refresh token is invalid or expired');
    return { ...user, tokenId: payload.tokenId };
  }
}