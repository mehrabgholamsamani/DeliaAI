import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CrmModule } from '../crm/crm.module.js';
import { WidgetService } from './widget.service.js';
import { PublicWidgetController, WorkspaceWidgetController } from './widget.controller.js';

@Module({
  imports: [AiModule, AuthModule, CrmModule],
  controllers: [WorkspaceWidgetController, PublicWidgetController],
  providers: [WidgetService],
  exports: [WidgetService]
})
export class WidgetModule {}
