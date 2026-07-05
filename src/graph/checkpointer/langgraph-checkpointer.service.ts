import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import pg from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

import type { AppConfig } from '../../config/app-config.types';
import { APP_CONFIG } from '../../config/config.constants';

/**
 * Owns the pg.Pool and PostgresSaver used by all LangGraph graphs.
 *
 * Uses a dedicated pool separate from Prisma's connection so the two
 * lifecycles remain independent and connection limits can be tuned separately.
 */
@Injectable()
export class LangGraphCheckpointerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger;
  private readonly pool: pg.Pool;
  private readonly saver: PostgresSaver;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.logger = logger.child({ context: LangGraphCheckpointerService.name });
    this.pool = new pg.Pool({ connectionString: config.db.url, max: 5 });
    this.saver = new PostgresSaver(this.pool, undefined, { schema: 'langgraph' });
  }

  async onModuleInit(): Promise<void> {
    const className = LangGraphCheckpointerService.name;
    const methodName = 'onModuleInit';
    await this.saver.setup();
    this.logger.info(
      `[${className}] [${methodName}] :: LangGraph checkpoint tables ready (schema: langgraph)`,
    );
  }

  getSaver(): PostgresSaver {
    return this.saver;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
