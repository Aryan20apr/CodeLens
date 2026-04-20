import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { APP_CONFIG } from './config/config.constants';
import type { AppConfig } from './config/app-config.types';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');


}
bootstrap();
