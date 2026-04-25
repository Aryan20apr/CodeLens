import 'dotenv/config';

import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { REFRESH_TOKEN_COOKIE_NAME } from './auth/refresh-cookie';
import { APP_CONFIG } from './config/config.constants';
import type { AppConfig } from './config/app-config.types';
import { resolveCorsOrigins } from './config/cors.util';
import { applyPassportReplyShim } from './config/fastify-passport-reply.shim';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  applyPassportReplyShim(app.getHttpAdapter().getInstance());

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const config = app.get<AppConfig>(APP_CONFIG);

  await app.register(fastifyCookie);

  app.setGlobalPrefix('api/v1');

  const corsOrigins = resolveCorsOrigins(config);
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CodeLens API')
    .setDescription('HTTP API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token', {
      type: 'apiKey',
      in: 'cookie',
      name: REFRESH_TOKEN_COOKIE_NAME,
    })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.port, '0.0.0.0');
}
bootstrap();
