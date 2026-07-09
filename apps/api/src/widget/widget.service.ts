import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { CrmService } from '../crm/crm.service.js';
import { ReceptionistWorkflowService } from '../ai/receptionist-workflow.service.js';
import { KnowledgeService } from '../ai/knowledge.service.js';
import type { Environment } from '../config/environment.js';
import type { z } from 'zod';
import type {
  widgetAvailabilitySchema,
  widgetChatSchema,
  widgetConfirmSchema,
  widgetHandoffSchema,
  widgetPrepareSchema,
  widgetSettingsSchema
} from './widget.schemas.js';

type SettingsInput = z.infer<typeof widgetSettingsSchema>;
type WidgetChatInput = z.infer<typeof widgetChatSchema>;
type WidgetAvailabilityInput = z.infer<typeof widgetAvailabilitySchema>;
type WidgetPrepareInput = z.infer<typeof widgetPrepareSchema>;
type WidgetConfirmInput = z.infer<typeof widgetConfirmSchema>;
type WidgetHandoffInput = z.infer<typeof widgetHandoffSchema>;

@Injectable()
export class WidgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly crm: CrmService,
    private readonly workflow: ReceptionistWorkflowService,
    private readonly knowledge: KnowledgeService,
    private readonly config: ConfigService<Environment, true>
  ) {}

  async settings(workspaceId: string) {
    return this.prisma.publicReceptionist.upsert({
      where: { workspaceId },
      update: {},
      create: { workspaceId, publicKey: this.newPublicKey() }
    });
  }

  async updateSettings(workspaceId: string, input: SettingsInput) {
    const allowedOrigins = [...new Set(input.allowedOrigins.map((origin) => this.normalizeOrigin(origin)))];
    return this.prisma.publicReceptionist.upsert({
      where: { workspaceId },
      update: {
        allowedOrigins,
        greeting: input.greeting,
        brandColor: input.brandColor,
        isEnabled: input.isEnabled,
        ...(input.regenerateKey ? { publicKey: this.newPublicKey() } : {})
      },
      create: {
        workspaceId,
        publicKey: this.newPublicKey(),
        allowedOrigins,
        greeting: input.greeting,
        brandColor: input.brandColor,
        isEnabled: input.isEnabled
      }
    });
  }

  async recentSessions(workspaceId: string) {
    const config = await this.settings(workspaceId);
    const sessions = await this.prisma.publicWidgetSession.findMany({
      where: { publicReceptionistId: config.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { conversationSession: { include: { messages: { orderBy: { createdAt: 'asc' }, take: 12 } } } }
    });
    return sessions.map((session) => ({
      id: session.id,
      origin: session.origin,
      createdAt: session.createdAt.toISOString(),
      messages: session.conversationSession.messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString()
      }))
    }));
  }

  async publicConfig(key: string, origin?: string) {
    const config = await this.getConfig(key, origin);
    const business = await this.crm.getBusiness(config.workspaceId);
    const services = await this.crm.listServices(false, config.workspaceId);
    return {
      businessName: business.businessName,
      greeting: config.greeting || business.greeting,
      brandColor: config.brandColor,
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceLabel: service.priceLabel
      }))
    };
  }

  async start(key: string, origin?: string) {
    const config = await this.getConfig(key, origin);
    const started = await this.ai.startCall(config.workspaceId);
    await this.prisma.publicWidgetSession.create({
      data: {
        publicReceptionistId: config.id,
        conversationSessionId: started.sessionId,
        origin: this.requestOrigin(origin)
      }
    });
    const business = await this.crm.getBusiness(config.workspaceId);
    const greeting = config.greeting || business.greeting || started.reply.displayText;
    return { sessionId: started.sessionId, reply: { ...started.reply, spokenText: greeting, displayText: greeting } };
  }

  async chat(input: WidgetChatInput, origin?: string) {
    const config = await this.getConfig(input.key, origin);
    await this.assertSession(config.id, input.sessionId);
    return this.ai.chat({ sessionId: input.sessionId, message: input.message, workspaceId: config.workspaceId });
  }

  async availability(input: WidgetAvailabilityInput, origin?: string) {
    const config = await this.getConfig(input.key, origin);
    return this.crm.getAvailability(input, config.workspaceId);
  }

  async prepare(input: WidgetPrepareInput, origin?: string) {
    const config = await this.getConfig(input.key, origin);
    await this.assertSession(config.id, input.sessionId);
    return this.workflow.prepare(
      { sessionId: input.sessionId, action: input.action, payload: input.payload } as never,
      config.workspaceId
    );
  }

  async confirm(input: WidgetConfirmInput, origin?: string) {
    const config = await this.getConfig(input.key, origin);
    await this.assertSession(config.id, input.sessionId);
    return this.workflow.confirm(
      { sessionId: input.sessionId, draftId: input.draftId, confirmed: input.confirmed },
      config.workspaceId
    );
  }

  async handoff(input: WidgetHandoffInput, origin?: string) {
    const config = await this.getConfig(input.key, origin);
    await this.assertSession(config.id, input.sessionId);
    return this.knowledge.createHandoff(
      { sessionId: input.sessionId, name: input.name, email: input.email, phone: input.phone, message: input.message },
      config.workspaceId
    );
  }

  async isAllowedEmbedOrigin(origin: string) {
    const normalized = this.normalizeOrigin(origin);
    const config = await this.prisma.publicReceptionist.findFirst({
      where: { isEnabled: true, allowedOrigins: { has: normalized } },
      select: { id: true }
    });
    return Boolean(config);
  }

  private async getConfig(key: string, origin?: string) {
    const config = await this.prisma.publicReceptionist.findUnique({ where: { publicKey: key } });
    if (!config) throw new NotFoundException('Widget configuration was not found');
    const requestOrigin = this.requestOrigin(origin);
    const isPreview = requestOrigin === this.config.get('WEB_ORIGIN', { infer: true });
    if ((!config.isEnabled && !isPreview) || (!isPreview && !config.allowedOrigins.includes(requestOrigin)))
      throw new ForbiddenException('This website is not authorised to use this receptionist');
    return config;
  }

  private async assertSession(publicReceptionistId: string, conversationSessionId: string) {
    const session = await this.prisma.publicWidgetSession.findFirst({
      where: { publicReceptionistId, conversationSessionId },
      select: { id: true }
    });
    if (!session) throw new NotFoundException('Widget conversation was not found');
  }

  private requestOrigin(origin?: string) {
    if (!origin) throw new ForbiddenException('A website origin is required');
    return this.normalizeOrigin(origin);
  }

  private normalizeOrigin(origin: string) {
    try { return new URL(origin).origin; } catch { throw new ForbiddenException('Website origin is invalid'); }
  }

  private newPublicKey() {
    return `dlw_${randomBytes(24).toString('base64url')}`;
  }
}
