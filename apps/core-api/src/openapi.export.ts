import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, createOpenApiDocument } from './configure-app.js';

/**
 * Writes the OpenAPI document without starting an HTTP listener.
 *
 * The web app consumes this file through `openapi-typescript` (D44). Running
 * the export through the same `configureApp()` as production guarantees the
 * generated paths include the `/api` global prefix.
 */
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    configureApp(app);
    await app.init();

    const document = createOpenApiDocument(app);
    const output = fileURLToPath(new URL('../openapi.json', import.meta.url));
    await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

    console.log(`OpenAPI document written to ${output}`);
  } finally {
    await app.close();
  }
}

await exportOpenApi();
