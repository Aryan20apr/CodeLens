import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { FastifyRequest } from 'fastify';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { AuthService } from '../auth.service';
import { REFRESH_TOKEN_COOKIE_NAME } from '../refresh-cookie';
import { APP_CONFIG } from '../../config/config.constants';
import type { AppConfig } from '../../config/app-config.types';

export interface JwtRefreshPayload {
  sub: string;
  tokenId: string;
  type: 'refresh';
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  private readonly logger: Logger;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private authService: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
  ) {
    const strategyLogger = logger.child({ context: JwtRefreshStrategy.name });

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: FastifyRequest) => {
          const className = JwtRefreshStrategy.name;
          const methodName = 'jwtFromRequest';
          const cookieNames = req.cookies ? Object.keys(req.cookies) : [];
          const refreshCookie = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

          strategyLogger.debug(
            `[${className}] [${methodName}] :: Extracting refresh JWT from cookie`,
            {
              hasRefreshCookie: Boolean(refreshCookie),
              refreshCookieLength: refreshCookie?.length ?? 0,
              cookieNames,
            },
          );

          return refreshCookie ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtRefreshSecret,
      passReqToCallback: true,
    });

    this.logger = strategyLogger;
  }

  async validate(_req: FastifyRequest, payload: JwtRefreshPayload) {
    const className = JwtRefreshStrategy.name;
    const methodName = 'validate';

    this.logger.debug(
      `[${className}] [${methodName}] :: Validating refresh JWT payload`,
      {
        userId: payload.sub,
        tokenId: payload.tokenId,
        type: payload.type,
      },
    );

    if (payload.type !== 'refresh') {
      this.logger.warn(
        `[${className}] [${methodName}] :: Rejected — JWT type is not refresh`,
        { type: payload.type, userId: payload.sub, tokenId: payload.tokenId },
      );
      throw new UnauthorizedException();
    }

    const user = await this.authService.validateRefreshToken(
      payload.sub,
      payload.tokenId,
    );

    if (!user) {
      this.logger.warn(
        `[${className}] [${methodName}] :: Rejected — refresh token invalid in database`,
        { userId: payload.sub, tokenId: payload.tokenId },
      );
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    this.logger.info(
      `[${className}] [${methodName}] :: Refresh JWT and database record valid`,
      { userId: payload.sub, tokenId: payload.tokenId },
    );

    return { ...user, tokenId: payload.tokenId };
  }
}
