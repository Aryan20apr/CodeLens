import type { FastifyReply } from 'fastify';
import type { StringValue } from 'ms';
import ms from 'ms';

import type { AppConfig } from '../config/app-config.types';

/** Cookie name — must match JwtRefreshStrategy extractor. */
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

/** Limit cookie to auth routes only (global prefix + controller path). */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

export function refreshCookieMaxAgeSeconds(refreshTtl: StringValue): number {
  return Math.floor(ms(refreshTtl) / 1000);
}

export function setRefreshTokenCookie(
  res: FastifyReply,
  token: string,
  appConfig: AppConfig,
): void {
  res.setCookie(REFRESH_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: appConfig.env === 'production',
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: refreshCookieMaxAgeSeconds(appConfig.auth.jwtRefreshExpiresIn),
  });
}

export function clearRefreshTokenCookie(
  res: FastifyReply,
  appConfig: AppConfig,
): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    path: REFRESH_TOKEN_COOKIE_PATH,
    secure: appConfig.env === 'production',
    sameSite: 'lax',
  });
}
