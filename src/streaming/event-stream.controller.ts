import { Controller, Get, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { RedisPubSubService } from './redis-pub-sub.service';

@Controller('snippet-evaluations-async')
export class EventStreamController {
  constructor(private readonly pubsub: RedisPubSubService) {}

  @Get(':threadId/stream')
  async stream(@Param('threadId') threadId: string, @Res() reply: FastifyReply) {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const channel = `snippet:${threadId}`;

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', { threadId });

    const unsubscribe = await this.pubsub.subscribe(channel, (msg) => {
      // Choose event type based on payload
      const m = msg as any;
      if (m?.type === 'job') send('job', m);
      else if (m?.type === 'graph') send('status', m);
      else send('message', m);
    });

    // Close handling
    reply.raw.on('close', async () => {
      await unsubscribe();
    });
  }
}