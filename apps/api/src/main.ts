import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { WidgetService } from './widget/widget.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Environment, true>);
  const widget = app.get(WidgetService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean | string) => void
    ) => {
      const appOrigin = config.get('WEB_ORIGIN', { infer: true });
      if (!origin || origin === appOrigin) return callback(null, true);
      void widget
        .isAllowedEmbedOrigin(origin)
        .then((allowed) => callback(null, allowed ? origin : false))
        .catch(() => callback(null, false));
    },
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
  );
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Receptionist API')
    .setDescription('NestJS API for the AI receptionist booking platform.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(
    config.get('PORT', { infer: true }) ?? config.get('API_PORT', { infer: true }),
    '0.0.0.0'
  );
}

void bootstrap();
