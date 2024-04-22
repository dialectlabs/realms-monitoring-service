import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { INestApplication, VersioningType } from '@nestjs/common';
import { Server } from 'http';

export const NOTIF_TYPE_ID_PROPOSALS = '04827917-dde4-48c7-bf1b-780b77895e97';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  configureHttpServer(app);
  configureUnhandledErrorsHandling();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  console.trace = (message, ...context) => logger.verbose(message, context);
  console.debug = (message, ...context) => logger.debug(message, context);
  console.log = (message, ...context) => logger.log(message, context);
  console.info = (message, ...context) => logger.log(message, context);
  console.warn = (message, ...context) => logger.warn(message, context);
  console.error = (message, ...context) => logger.error(message, context);
  await app.listen(process.env.PORT ?? 0);
}

function configureHttpServer(app: INestApplication) {
  // https://shuheikagawa.com/blog/2019/04/25/keep-alive-timeout/
  // ALB has default timeout of 60 seconds
  const httpAdapter = app.getHttpAdapter();
  const server: Server = httpAdapter.getHttpServer();
  server.keepAliveTimeout = 61 * 1000;
  server.headersTimeout = 65 * 1000;
}

function configureUnhandledErrorsHandling() {
  process.on('unhandledRejection', (error) => {
    console.error(error);
  });
  process.on('uncaughtException', (error) => {
    console.error(error);
  });
}

bootstrap();
