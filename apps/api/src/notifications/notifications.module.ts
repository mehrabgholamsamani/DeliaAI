import { Module } from '@nestjs/common';
import { OwnerNotificationService } from './owner-notification.service.js';

@Module({
  providers: [OwnerNotificationService],
  exports: [OwnerNotificationService]
})
export class NotificationsModule {}
