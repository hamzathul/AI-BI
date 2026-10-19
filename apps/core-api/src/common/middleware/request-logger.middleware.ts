import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('RequestLogger');

/**
 * One log line per request: method, path, status, duration.
 *
 * This is middleware rather than an interceptor because unmatched routes
 * (404s) and guard failures never enter the interceptor pipeline — they would
 * be invisible. `finish` fires once the response has actually been sent, so
 * the status and duration are final.
 */
export function requestLogger(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();

  response.on('finish', () => {
    const duration = Math.round(performance.now() - startedAt);
    const message = `${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms`;

    if (response.statusCode >= 500) {
      logger.error(message);
    } else if (response.statusCode >= 400) {
      logger.warn(message);
    } else {
      logger.log(message);
    }
  });

  next();
}
