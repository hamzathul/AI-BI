import type { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { requestLogger } from './common/middleware/request-logger.middleware.js';

/**
 * App-wide HTTP configuration.
 *
 * `main.ts` and the e2e tests both call this, so tests boot the app the same
 * way production does. Global pipes and guards go here too.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(requestLogger);
  app.useGlobalFilters(new AllExceptionsFilter());
}
