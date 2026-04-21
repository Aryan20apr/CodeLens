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
    jwtAccessExpiresIn: string;
    jwtRefreshSecret: string;
    jwtRefreshExpiresIn: string;
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
}
