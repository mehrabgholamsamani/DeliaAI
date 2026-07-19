import { Module } from '@nestjs/common';
import { AuthController, WorkspaceController } from './auth.controller.js';
import { SessionAuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { AiModule } from '../ai/ai.module.js';
import { CrmModule } from '../crm/crm.module.js';

@Module({
  imports: [AiModule, CrmModule],
  controllers: [AuthController, WorkspaceController],
  providers: [AuthService, SessionAuthGuard],
  exports: [AuthService, SessionAuthGuard]
})
export class AuthModule {}
