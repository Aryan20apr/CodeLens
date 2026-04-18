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
  },
  db: {
    url: {
      doc: 'Database URL',
      format: String,
      default: '',
      env: 'DATABASE_URL',
    },
  }
});
