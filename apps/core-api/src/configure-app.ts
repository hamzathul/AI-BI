import type { INestApplication } from '@nestjs/common';

/**
 * App-wide HTTP configuration.
 *
 * `main.ts` and the e2e tests both call this, so tests boot the app the same
 * way production does. Global pipes, filters, and interceptors go here too
 * (steps 1.3 and beyond).
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
