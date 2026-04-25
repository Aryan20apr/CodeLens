import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * Passport (OAuth) uses Node's `OutgoingMessage` API: `res.setHeader` and `res.end` in
 * `strategy.redirect`. Nest on Fastify passes a Fastify `Reply` to Passport, which only
 * exposes `header` / `send` — this bridges the two.
 */
export function applyPassportReplyShim(fastify: FastifyInstance): void {
  if (fastify.hasReplyDecorator('setHeader')) {
    return;
  }

  fastify.decorateReply(
    'setHeader',
    function (
      this: FastifyReply,
      name: string,
      value: string | string[] | number,
    ) {
      return this.header(
        name,
        typeof value === 'string' || Array.isArray(value)
          ? value
          : String(value),
      );
    },
  );

  fastify.decorateReply(
    'end',
    function (this: FastifyReply, chunk?: string | Buffer) {
      if (chunk === undefined) {
        return this.send();
      }
      return this.send(
        typeof chunk === 'string' || Buffer.isBuffer(chunk)
          ? chunk
          : String(chunk),
      );
    },
  );
}
