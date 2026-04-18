import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg(config.db.url),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
