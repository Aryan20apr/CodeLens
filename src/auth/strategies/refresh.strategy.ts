import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { APP_CONFIG } from '../../config/config.constants';
import type { AppConfig } from '../../config/app-config.types';

export interface JwtRefreshPayload {
  sub: string;
  tokenId: string;
  type: 'refresh';
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtRefreshSecret,
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