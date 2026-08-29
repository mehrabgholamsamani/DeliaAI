import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from './config/environment.js';
import type { HealthResponse } from '@receptionist/contracts';
import { PrismaService } from './database/prisma.service.js';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>
  ) {}
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'ai-receptionist-api',
      timestamp: new Date().toISOString()
    };
  }

  async getReady() {
    await this.prisma.$queryRaw`SELECT 1`;
    if (this.config.get('RAG_V2_ENABLED', { infer: true })) {
      const extensions = await this.prisma.$queryRaw<
        { installed: boolean }[]
      >`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') AS installed`;
      if (!extensions[0]?.installed)
        throw new ServiceUnavailableException('pgvector is required while RAG v2 is enabled.');
    }
    return { status: 'ok', database: 'ready', timestamp: new Date().toISOString() };
  }
}
