import type { AppConfig } from './app-config.types';

/** Resolves explicit origin allowlist: `FRONTEND_URL` plus any `CORS_ALLOWED_ORIGINS`. */
export function resolveCorsOrigins(config: AppConfig): string[] {
  const extra = config.cors.allowedOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([config.frontend.url, ...extra])];
}
