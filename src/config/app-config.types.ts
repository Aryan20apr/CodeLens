import type { StringValue } from 'ms';

export interface AppConfig {
  env: 'production' | 'development' | 'test';
  port: number;
  log: {
    level: string;
    pretty: boolean;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
    queueDb: number;
  };
  db: {
    url: string;
  };
  auth: {
    jwtAccessSecret: string;
    jwtAccessExpiresIn: StringValue;
    jwtRefreshSecret: string;
    jwtRefreshExpiresIn: StringValue;
    encryptionKey: string; // 32-byte hex for AES-256 OAuth token encryption
  };
  oauth: {
    github: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    google: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
  };
  frontend: {
    url: string;
  };
  /** Browser CORS — required for httpOnly cookies + credentials from the SPA. */
  cors: {
    /** Comma-separated origins; always merged with `frontend.url`. */
    allowedOrigins: string;
  };
}
