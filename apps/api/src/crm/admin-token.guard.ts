import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Environment } from '../config/environment.js';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('ADMIN_API_TOKEN', { infer: true });
    if (!expected) throw new ServiceUnavailableException('Admin access is not configured');
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header('x-admin-token') !== expected) throw new UnauthorizedException();
    return true;
  }
}
