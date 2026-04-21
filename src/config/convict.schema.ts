import convict from 'convict';

import type { AppConfig } from './app-config.types';

export const convictSchema = convict<AppConfig>({
  env: {
    doc: 'Application environment',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  port: {
    doc: 'HTTP listen port',
    format: 'port',
    default: 3000,
    env: 'PORT',
  },
  log: {
    level: {
      doc: 'Winston log level (e.g. error, warn, info, debug, verbose)',
      format: String,
      default: 'info',
      env: 'LOG_LEVEL',
    },
    pretty: {
      doc: 'Nest-style colorized console output (disable in prod for JSON logs)',
      format: Boolean,
      default: true,
      env: 'LOG_PRETTY',
    },
  },
  redis: {
    host: {
      doc: 'Redis host',
      format: String,
      default: '127.0.0.1',
      env: 'REDIS_HOST',
    },
    port: {
      doc: 'Redis port',
      format: 'port',
      default: 6379,
      env: 'REDIS_PORT',
    },
    password: {
      doc: 'Redis password (empty if no auth)',
      format: String,
      default: '',
      env: 'REDIS_PASSWORD',
    },
    db: {
      doc: 'Redis logical database index',
      format: 'nat',
      default: 0,
      env: 'REDIS_DB',
    },
    queueDb: {
      doc: 'Redis logical database index for BullMQ queues',
      format: 'nat',
      default: 1,
      env: 'REDIS_QUEUE_DB',
    },
  },
  db: {
    url: {
      doc: 'Database URL',
      format: String,
      default: '',
      env: 'DATABASE_URL',
    },
  },
  auth: {
    jwtAccessSecret: {
      doc: 'JWT access token secret',
      format: String,
      default: '',
      env: 'JWT_ACCESS_SECRET',
      sensitive: true,
    },
    jwtAccessExpiresIn: {
      doc: 'JWT access token TTL (e.g. 15m)',
      format: String,
      default: '15m',
      env: 'JWT_ACCESS_EXPIRES_IN',
    },
    jwtRefreshSecret: {
      doc: 'JWT refresh token secret',
      format: String,
      default: '',
      env: 'JWT_REFRESH_SECRET',
      sensitive: true,
    },
    jwtRefreshExpiresIn: {
      doc: 'JWT refresh token TTL (e.g. 7d)',
      format: String,
      default: '7d',
      env: 'JWT_REFRESH_EXPIRES_IN',
    },
    encryptionKey: {
      doc: '32-byte hex key for AES-256 OAuth token encryption',
      format: String,
      default: '',
      env: 'ENCRYPTION_KEY',
      sensitive: true,
    },
  },
  oauth: {
    github: {
      clientId: {
        doc: 'GitHub OAuth App Client ID',
        format: String,
        default: '',
        env: 'GITHUB_CLIENT_ID',
      },
      clientSecret: {
        doc: 'GitHub OAuth App Client Secret',
        format: String,
        default: '',
        env: 'GITHUB_CLIENT_SECRET',
        sensitive: true,
      },
      callbackUrl: {
        doc: 'GitHub OAuth callback URL',
        format: String,
        default: 'http://localhost:3000/api/v1/auth/github/callback',
        env: 'GITHUB_CALLBACK_URL',
      },
    },
    google: {
      clientId: {
        doc: 'Google OAuth Client ID',
        format: String,
        default: '',
        env: 'GOOGLE_CLIENT_ID',
      },
      clientSecret: {
        doc: 'Google OAuth Client Secret',
        format: String,
        default: '',
        env: 'GOOGLE_CLIENT_SECRET',
        sensitive: true,
      },
      callbackUrl: {
        doc: 'Google OAuth callback URL',
        format: String,
        default: 'http://localhost:3000/api/v1/auth/google/callback',
        env: 'GOOGLE_CALLBACK_URL',
      },
    },
  },
  frontend: {
    url: {
      doc: 'Frontend base URL (for OAuth redirects)',
      format: String,
      default: 'http://localhost:3001',
      env: 'FRONTEND_URL',
    },
  },
});
