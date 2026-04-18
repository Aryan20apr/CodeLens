import 'dotenv/config';
import { defineConfig } from 'prisma/config';

import { loadConfig } from './src/config/load-config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: loadConfig().db.url,
  },
});
