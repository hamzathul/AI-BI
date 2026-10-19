import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // SIGINT/SIGTERM → Nest closes the app → PrismaService disconnects (2.1c).
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'));
}

await bootstrap();
