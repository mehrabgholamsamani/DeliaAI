import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@receptionist/contracts';
import { AppService } from './app.service.js';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOkResponse({ description: 'API process is running.' })
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }

  @Get('ready')
  getReady() {
    return this.appService.getReady();
  }
}
