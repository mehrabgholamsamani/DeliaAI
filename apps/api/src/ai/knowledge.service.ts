import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../database/prisma.service.js';
import type { Environment } from '../config/environment.js';
import type { z } from 'zod';
import type { knowledgeArticleSchema } from './ai.schemas.js';

type KnowledgeInput = z.input<typeof knowledgeArticleSchema>;
const LEGACY_WORKSPACE_ID = 'legacy';

const defaults: KnowledgeInput[] = [
  {
    slug: 'booking-help',
    title: 'Booking help',
    content:
      'Customers can browse services, select a live available time, and confirm a booking. They receive a secure management link after booking to reschedule or cancel.',
    isActive: true,
    category: 'FAQ'
  },
  {
    slug: 'contact-and-handoff',
    title: 'Contact and handoff',
    content:
      'If the receptionist cannot answer a question or a customer needs personal assistance, it should offer to have a team member follow up. Do not promise a response time unless it is configured in approved content.',
    isActive: true,
    category: 'INTERNAL'
  },
  {
    slug: 'privacy',
    title: 'Privacy',
    content:
      'The receptionist should only request the name, email, phone number, service, appointment time, and optional booking notes needed to make an appointment. It does not record raw audio by default.',
    isActive: true,
    category: 'POLICY'
  }
];

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>
  ) {}

  async list(includeInactive = false, workspaceId = LEGACY_WORKSPACE_ID) {
    await this.ensureDefaults(workspaceId);
    return this.prisma.knowledgeArticle.findMany({
      where: { workspaceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { title: 'asc' }
    });
  }

  async upsert(input: KnowledgeInput, workspaceId = LEGACY_WORKSPACE_ID) {
    const article = { ...input, category: input.category ?? 'FAQ' };
    const embedding = await this.embed(`${article.title}\n${article.content}`);
    return this.prisma.knowledgeArticle.upsert({
      where: { workspaceId_slug: { workspaceId, slug: article.slug } },
      update: { ...article, embedding },
      create: { ...article, workspaceId, isActive: article.isActive ?? true, embedding }
    });
  }

  async remove(slug: string, workspaceId = LEGACY_WORKSPACE_ID) {
    return this.prisma.knowledgeArticle.delete({
      where: { workspaceId_slug: { workspaceId, slug } }
    });
  }

  async insights(workspaceId = LEGACY_WORKSPACE_ID) {
    const [articles, openQuestions, openHandoffs] = await Promise.all([
      this.prisma.knowledgeArticle.groupBy({
        by: ['isActive'],
        where: { workspaceId },
        _count: { _all: true }
      }),
      this.prisma.receptionistFeedback.findMany({
        where: { workspaceId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 12
      }),
      this.prisma.handoffRequest.findMany({
        where: { workspaceId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 12
      })
    ]);
    return {
      activeArticles: articles.find((item) => item.isActive)?._count._all ?? 0,
      draftArticles: articles.find((item) => !item.isActive)?._count._all ?? 0,
      openQuestions,
      openHandoffs
    };
  }

  async createHandoff(
    input: {
      sessionId?: string;
      name: string;
      email: string;
      phone: string;
      message: string;
    },
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    return this.prisma.handoffRequest.create({ data: { ...input, workspaceId } });
  }

  async relevantFor(query: string, workspaceId = LEGACY_WORKSPACE_ID) {
    let articles = await this.list(false, workspaceId);
    const terms = new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    const queryEmbedding = await this.embed(query);
    if (queryEmbedding && articles.some((article) => !this.vector(article.embedding))) {
      const refreshed = await Promise.all(
        articles.map(async (article) => {
          if (this.vector(article.embedding)) return article;
          const embedding = await this.embed(`${article.title}\n${article.content}`);
          return embedding
            ? this.prisma.knowledgeArticle.update({
                where: { id: article.id },
                data: { embedding }
              })
            : article;
        })
      );
      articles = refreshed;
    }
    return articles
      .map((article) => ({
        article,
        lexicalScore: [...terms].filter((term) =>
          `${article.title} ${article.content}`.toLowerCase().includes(term)
        ).length,
        semanticScore: queryEmbedding
          ? this.cosine(queryEmbedding, this.vector(article.embedding))
          : 0
      }))
      .sort(
        (a, b) =>
          b.semanticScore - a.semanticScore ||
          b.lexicalScore - a.lexicalScore ||
          a.article.title.localeCompare(b.article.title)
      )
      .slice(0, 6)
      .map((item) => item.article);
  }

  private async embed(content: string): Promise<number[] | undefined> {
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) return undefined;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.embedContent({
        model: this.config.get('GEMINI_EMBEDDING_MODEL', { infer: true }),
        contents: [content],
        config: { outputDimensionality: 256 }
      });
      return response.embeddings?.[0]?.values?.map(Number);
    } catch {
      return undefined;
    }
  }

  private vector(value: unknown): number[] | undefined {
    return Array.isArray(value) && value.every((item) => typeof item === 'number')
      ? value
      : undefined;
  }

  private cosine(left: number[], right?: number[]) {
    if (!right || left.length !== right.length) return 0;
    let dot = 0,
      leftMagnitude = 0,
      rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
      dot += left[index] * right[index];
      leftMagnitude += left[index] ** 2;
      rightMagnitude += right[index] ** 2;
    }
    return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
  }

  private async ensureDefaults(workspaceId: string) {
    if (await this.prisma.knowledgeArticle.count({ where: { workspaceId } })) return;
    await this.prisma.knowledgeArticle.createMany({
      data: defaults.map((article) => ({ ...article, workspaceId }))
    });
  }
}
