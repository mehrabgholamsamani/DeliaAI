import { Module } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard.js';
import { AdminController } from './admin.controller.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({
  controllers: [CrmController, AdminController],
  providers: [CrmService, AdminTokenGuard],
  exports: [CrmService]
})
export class CrmModule {}
