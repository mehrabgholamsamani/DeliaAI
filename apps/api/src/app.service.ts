import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@receptionist/contracts';
import { PrismaService } from './database/prisma.service.js';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'ai-receptionist-api',
      timestamp: new Date().toISOString()
    };
  }

  async getReady() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ready', timestamp: new Date().toISOString() };
  }
}
