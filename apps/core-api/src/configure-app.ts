import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI BI API')
    .setDescription('Core API for AI BI')
    .setVersion('0.1.0')
    .build();

  // A factory defers document generation until the first request, so app boot
  // and every e2e test stay fast. `useGlobalPrefix` keeps the docs under /api.
  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, documentFactory, { useGlobalPrefix: true });
}
