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
}
