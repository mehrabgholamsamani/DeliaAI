import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Environment } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';

type BookingNotice = {
  customer: { name: string; email: string; phone: string };
  service: { name: string };
  appointmentAt: Date;
};

@Injectable()
export class OwnerNotificationService {
  private readonly logger = new Logger(OwnerNotificationService.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService
  ) {}

  async bookingCreated(workspaceId: string, booking: BookingNotice) {
    const when = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC'
    }).format(booking.appointmentAt);
    await this.deliver(workspaceId, `New booking: ${booking.customer.name}`, [
      `A new ${booking.service.name} appointment has been confirmed for ${when} UTC.`,
      '',
      `Customer: ${booking.customer.name}`,
      `Email: ${booking.customer.email}`,
      `Phone: ${booking.customer.phone}`
    ].join('\n'));
  }

  async handoffCreated(
    workspaceId: string,
    handoff: { name: string; email: string; phone: string; message: string }
  ) {
    await this.deliver(workspaceId, `Follow-up requested: ${handoff.name}`, [
      'A visitor asked for a human follow-up.',
      '',
      `Customer: ${handoff.name}`,
      `Email: ${handoff.email}`,
      `Phone: ${handoff.phone}`,
      `Message: ${handoff.message}`
    ].join('\n'));
  }

  private async deliver(workspaceId: string, subject: string, text: string) {
    const host = this.config.get('SMTP_HOST', { infer: true });
    const from = this.config.get('NOTIFICATION_FROM', { infer: true });
    if (!host || !from) {
      this.logger.debug(`Owner notification skipped for ${workspaceId}: SMTP is not configured.`);
      return;
    }
    const owner = await this.prisma.userAccount.findUnique({
      where: { workspaceId },
      select: { email: true }
    });
    if (!owner) return;
    try {
      const port = this.config.get('SMTP_PORT', { infer: true });
      const user = this.config.get('SMTP_USER', { infer: true });
      const pass = this.config.get('SMTP_PASSWORD', { infer: true });
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        ...(user && pass ? { auth: { user, pass } } : {})
      });
      await transporter.sendMail({ from, to: owner.email, subject, text });
    } catch (error) {
      this.logger.error(
        `Owner notification failed for ${workspaceId}: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
}
