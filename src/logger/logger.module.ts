import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { utilities as nestWinstonUtilities } from 'nest-winston';

import { APP_CONFIG } from '../config/config.constants';
import type { AppConfig } from '../config/app-config.types';
import { AppConfigModule } from '../config/config.module';
import { correlationIdFormat } from './correlation-id.format';

@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_CONFIG],
      useFactory: (appConfig: AppConfig) => {
        const consoleFormat = appConfig.log.pretty
          ? winston.format.combine(
              correlationIdFormat(),
              winston.format.timestamp(),
              winston.format.ms(),
              nestWinstonUtilities.format.nestLike('CodeLens', {
                colors: appConfig.env !== 'production',
                prettyPrint: true,
              }),
            )
          : winston.format.combine(
              correlationIdFormat(),
              winston.format.timestamp(),
              winston.format.ms(),
              winston.format.json(),
            );

        return {
          level: appConfig.log.level,
          transports: [
            new winston.transports.Console({ format: consoleFormat }),
          ],
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
