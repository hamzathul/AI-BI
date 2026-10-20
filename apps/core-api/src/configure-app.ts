import type { INestApplication } from '@nestjs/common';
import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import { ConfigService } from '@nestjs/config';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { requestLogger } from './common/middleware/request-logger.middleware.js';

/**
 * App-wide HTTP configuration.
 *
 * `main.ts`, the e2e tests, and the OpenAPI export script all call this, so
 * they boot the app the same way production does. Global pipes and guards go
 * here too.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  // The browser calls the API directly (D43). Only the configured web origin
  // is allowed; credentials stay disabled until auth/cookies arrive in Phase 8.
  // A callback reflects the origin only when it matches; a plain string would
  // still echo the allowed origin to a different caller.
  const config = app.get(ConfigService);
  const webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  const allowWebOrigin: CustomOrigin = (origin, callback) => {
    callback(null, origin === webOrigin);
  };
  app.enableCors({ origin: allowWebOrigin });

  app.use(requestLogger);
  app.useGlobalFilters(new AllExceptionsFilter());

  // A factory defers document generation until the first request, so app boot
  // and every e2e test stay fast. `useGlobalPrefix` keeps the docs under /api.
  const documentFactory = () => createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, documentFactory, { useGlobalPrefix: true });
}

/** Shared by Swagger UI and the build-time OpenAPI export (D44). */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI BI API')
    .setDescription('Core API for AI BI')
    .setVersion('0.1.0')
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}
