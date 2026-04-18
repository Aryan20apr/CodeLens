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
  };
  db: {
    url: string;
  };
}
