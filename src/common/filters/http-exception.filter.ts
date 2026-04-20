import * as http from 'node:http';

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { APP_CONFIG } from '../../config/config.constants';
import type { AppConfig } from '../../config/app-config.types';

export interface HttpErrorBody {
  statusCode: number;
  message: string;
  error: string;
  details: unknown | null;
}

/** Fastify reply shape used by this filter (avoids a direct `fastify` package dependency). */
type FastifyReplyLike = {
  status: (code: number) => { send: (payload: HttpErrorBody) => void };
};

function resolveErrorName(status: number, bodyError?: string): string {
  if (typeof bodyError === 'string' && bodyError.length > 0) {
    return bodyError;
  }
  return http.STATUS_CODES[status] ?? 'Error';
}

function normalizeHttpExceptionPayload(
  status: number,
  responseBody: string | object,
): Pick<HttpErrorBody, 'message' | 'error' | 'details'> {
  if (typeof responseBody === 'string') {
    return {
      message: responseBody,
      error: resolveErrorName(status),
      details: null,
    };
  }

  const body = responseBody as Record<string, unknown>;
  const rawError = body['error'];
  const errorName = resolveErrorName(
    status,
    typeof rawError === 'string' ? rawError : undefined,
  );

  const msg = body['message'];
  const customDetails = body['details'];

  if (Array.isArray(msg)) {
    const detailsValue =
      customDetails !== undefined ? customDetails : msg.length > 0 ? msg : null;
    return {
      message:
        msg.length === 0
          ? errorName
          : msg.length === 1
            ? String(msg[0])
            : 'Validation failed',
      error: errorName,
      details: detailsValue ?? null,
    };
  }

  if (typeof msg === 'string') {
    return {
      message: msg,
      error: errorName,
      details: customDetails !== undefined ? customDetails : null,
    };
  }

  return {
    message: errorName,
    error: errorName,
    details: customDetails !== undefined ? customDetails : null,
  };
}

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReplyLike>();
    const req = ctx.getRequest<{ method?: string; url?: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = exception.getResponse();
      const { message, error, details } = normalizeHttpExceptionPayload(
        status,
        responseBody,
      );
      const body: HttpErrorBody = {
        statusCode: status,
        message,
        error,
        details,
      };
      reply.status(status).send(body);
      return;
    }

    const isProduction = this.config.env === 'production';

    this.logger.error(
      `Unhandled exception ${req.method ?? '?'} ${req.url ?? '?'}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const message = isProduction
      ? 'Internal server error'
      : exception instanceof Error
        ? exception.message
        : 'Internal server error';

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const body: HttpErrorBody = {
      statusCode: status,
      message,
      error: resolveErrorName(status),
      details: null,
    };
    reply.status(status).send(body);
  }
}
