import { ClsServiceManager } from 'nestjs-cls';
import * as winston from 'winston';

/** Merges nestjs-cls request id into log records as `correlationId` when CLS is active. */
export function correlationIdFormat(): winston.Logform.Format {
  return winston.format((info: winston.Logform.TransformableInfo) => {
    try {
      const cls = ClsServiceManager.getClsService();
      const id = cls.getId();
      if (typeof id === 'string' && id.length > 0) {
        info.correlationId = id;
      }
    } catch {
      /* bootstrap or uninitialized CLS — omit field */
    }
    return info;
  })();
}
