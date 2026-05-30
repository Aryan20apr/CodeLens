import {
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import { REFRESH_TOKEN_COOKIE_NAME } from '../refresh-cookie';

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  private readonly logger: Logger;

  constructor(@Inject(WINSTON_MODULE_PROVIDER) logger: Logger) {
    super();
    this.logger = logger.child({ context: JwtRefreshAuthGuard.name });
  }

  canActivate(context: ExecutionContext) {
    const className = JwtRefreshAuthGuard.name;
    const methodName = 'canActivate';
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const cookieNames = req.cookies ? Object.keys(req.cookies) : [];
    const refreshCookie = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    this.logger.info(
      `[${className}] [${methodName}] :: Refresh route — cookie presence`,
      {
        path: req.url,
        origin: req.headers.origin,
        hasRefreshCookie: Boolean(refreshCookie),
        refreshCookieLength: refreshCookie?.length ?? 0,
        cookieNames,
      },
    );

    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | { message?: string; name?: string } | undefined,
  ): TUser {
    const className = JwtRefreshAuthGuard.name;
    const methodName = 'handleRequest';

    if (err || !user) {
      this.logger.warn(
        `[${className}] [${methodName}] :: Refresh auth failed before handler`,
        {
          hasUser: Boolean(user),
          errorName: err?.name,
          errorMessage: err?.message,
          infoName: info && 'name' in info ? info.name : undefined,
          infoMessage: info && 'message' in info ? info.message : undefined,
        },
      );
      throw err ?? new UnauthorizedException();
    }

    this.logger.debug(
      `[${className}] [${methodName}] :: Refresh auth succeeded`,
      {
        userId: (user as { id?: string }).id,
        tokenId: (user as { tokenId?: string }).tokenId,
      },
    );

    return user;
  }
}
