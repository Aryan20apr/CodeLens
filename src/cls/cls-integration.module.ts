import { ExecutionContext, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';

/** Fastify reply shape used only to avoid a direct `fastify` dependency. */
type HeaderReply = {
  header(name: string, value: string): unknown;
};

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      // Express-style middleware breaks Fastify's hook chain; use the global interceptor instead.
      middleware: { mount: false },
      interceptor: {
        mount: true,
        generateId: true,
        idGenerator: (_ctx: ExecutionContext) => randomUUID(),
        setup: async (cls, context: ExecutionContext) => {
          const reply = context
            .switchToHttp()
            .getResponse<HeaderReply>();
          const id = cls.getId();
          if (id) reply.header('X-Correlation-Id', id);
        },
      },
    }),
  ],
  exports: [ClsModule],
})
export class ClsIntegrationModule {}
