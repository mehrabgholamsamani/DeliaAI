import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiController, KnowledgeAdminController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { KnowledgeService } from './knowledge.service.js';
import { ReceptionistWorkflowService } from './receptionist-workflow.service.js';
import { ReceptionistGateway } from './receptionist.gateway.js';
import { SpeechService } from './speech.service.js';

@Module({
  imports: [CrmModule, NotificationsModule],
  controllers: [AiController, KnowledgeAdminController],
  providers: [
    AiService,
    KnowledgeService,
    ReceptionistWorkflowService,
    ReceptionistGateway,
    SpeechService
  ],
  exports: [AiService, KnowledgeService, ReceptionistWorkflowService]
})
export class AiModule {}
