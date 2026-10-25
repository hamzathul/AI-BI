import { BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { SyncService } from '../metadata/sync.service.js';
import { ACME_SEMANTIC_MODEL } from './acme-model.js';
import { SemanticService } from './semantic.service.js';
import { semanticModelDocumentSchema } from './semantic-model.schema.js';

/**
 * Loads the Acme semantic model into the app database.
 *
 * Run after `pnpm db:seed` (source data) and with `apps/core-api/.env` present.
 * The source metadata is synced first so the model validates against what is
 * actually in the source database.
 */
async function seedAcmeSemanticModel(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const sync = await app.get(SyncService).runSync();
    console.log(
      `Metadata synced: ${sync.counts.schemas} schemas, ${sync.counts.objects} objects, ${sync.counts.relations} relations.`,
    );

    const document = semanticModelDocumentSchema.parse(ACME_SEMANTIC_MODEL);
    const saved = await app.get(SemanticService).save(document);
    const metrics = document.datasets.reduce(
      (count, dataset) => count + dataset.metrics.length,
      0,
    );

    console.log(
      `Seeded semantic model "${saved.model?.name}" with ${document.datasets.length} datasets and ${metrics} metrics.`,
    );
  } catch (error) {
    if (error instanceof BadRequestException) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await seedAcmeSemanticModel();
