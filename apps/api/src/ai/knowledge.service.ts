import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { Environment } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { OwnerNotificationService } from '../notifications/owner-notification.service.js';
import type { knowledgeArticleSchema } from './ai.schemas.js';
import { DocumentParserService } from './document-parser.service.js';
import { GeminiEmbeddingProvider } from './embedding.service.js';
import { chunkKnowledge, evidenceBlock, reciprocalRankFusion } from './rag.utils.js';

type KnowledgeInput = z.input<typeof knowledgeArticleSchema>;
type Candidate = {
  id: string;
  sourceId: string;
  sourceType: 'ARTICLE' | 'DOCUMENT';
  key: string;
  title: string;
  category: string;
  ordinal: number;
  content: string;
  semanticScore: number;
};
export type Citation = {
  id: string;
  label: string;
  sourceType: 'ARTICLE' | 'DOCUMENT';
  category: string;
};
export type RetrievalResult = {
  sources: Candidate[];
  citations: Citation[];
  context: string;
  mode: 'hybrid' | 'lexical';
  fallbackReason?: string;
};
const LEGACY_WORKSPACE_ID = 'legacy';
const categories = new Set(['COMPANY', 'SERVICE', 'POLICY', 'FAQ', 'PROMOTION', 'INTERNAL']);
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
    private readonly config: ConfigService<Environment, true>,
    private readonly notifications: OwnerNotificationService,
    private readonly parser: DocumentParserService,
    private readonly embeddings: GeminiEmbeddingProvider
  ) {}

  async list(includeInactive = false, workspaceId = LEGACY_WORKSPACE_ID) {
    await this.ensureDefaults(workspaceId);
    return this.prisma.knowledgeArticle.findMany({
      where: { workspaceId, ...(includeInactive ? {} : { isActive: true }) },
      select: articleMetadata,
      orderBy: { title: 'asc' }
    });
  }
  async upsert(input: KnowledgeInput, workspaceId = LEGACY_WORKSPACE_ID) {
    const existing = await this.prisma.knowledgeArticle.findUnique({
      where: { workspaceId_slug: { workspaceId, slug: input.slug } }
    });
    const revision = (existing?.indexingRevision ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.knowledgeArticle.upsert({
        where: { workspaceId_slug: { workspaceId, slug: input.slug } },
        update: {
          ...input,
          category: input.category ?? 'FAQ',
          indexingRevision: revision,
          indexingStatus: 'PENDING',
          indexingAttempts: 0,
          indexingNextAttemptAt: new Date(),
          indexingLeaseUntil: null,
          indexingError: null
        },
        create: {
          ...input,
          workspaceId,
          category: input.category ?? 'FAQ',
          isActive: input.isActive ?? true,
          indexingRevision: revision
        }
      });
      await tx.knowledgeChunk.deleteMany({ where: { articleId: article.id } });
      await tx.knowledgeChunk.createMany({
        data: chunkKnowledge(`${article.title}\n\n${article.content}`).map((chunk) => ({
          ...chunk,
          workspaceId,
          articleId: article.id,
          sourceRevision: revision
        }))
      });
      return tx.knowledgeArticle.findUniqueOrThrow({
        where: { id: article.id },
        select: articleMetadata
      });
    });
  }
  remove(slug: string, workspaceId = LEGACY_WORKSPACE_ID) {
    return this.prisma.knowledgeArticle.delete({
      where: { workspaceId_slug: { workspaceId, slug } }
    });
  }
  listDocuments(workspaceId: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: { workspaceId },
      select: documentMetadata,
      orderBy: { updatedAt: 'desc' }
    });
  }
  async uploadDocument(
    file: Express.Multer.File,
    fields: { title?: string; category?: string },
    workspaceId: string
  ) {
    const extracted = await this.parser.extract(file);
    const category = fields.category || 'FAQ';
    if (!categories.has(category)) throw new BadRequestException('Invalid knowledge category.');
    const title = fields.title?.trim().slice(0, 160) || extracted.filename.replace(/\.[^.]+$/, '');
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.knowledgeDocument.create({
        data: {
          workspaceId,
          title,
          filename: extracted.filename,
          mimeType: extracted.mimeType,
          category,
          extractedText: extracted.text,
          byteCount: file.size,
          pageCount: extracted.pageCount
        }
      });
      await tx.knowledgeChunk.createMany({
        data: chunkKnowledge(extracted.text).map((chunk) => ({
          ...chunk,
          workspaceId,
          documentId: document.id,
          sourceRevision: 1
        }))
      });
      return tx.knowledgeDocument.findUniqueOrThrow({
        where: { id: document.id },
        select: documentMetadata
      });
    });
  }
  async updateDocument(
    id: string,
    input: { title?: string; category?: string; isActive?: boolean },
    workspaceId: string
  ) {
    const current = await this.prisma.knowledgeDocument.findFirst({ where: { id, workspaceId } });
    if (!current) throw new NotFoundException('Document not found.');
    if (input.category && !categories.has(input.category))
      throw new BadRequestException('Invalid knowledge category.');
    const changed =
      (input.title !== undefined && input.title !== current.title) ||
      (input.category !== undefined && input.category !== current.category);
    if (!changed)
      return this.prisma.knowledgeDocument.update({
        where: { id },
        data: input,
        select: documentMetadata
      });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeDocument.update({
        where: { id },
        data: {
          ...input,
          indexingRevision: { increment: 1 },
          indexingStatus: 'PENDING',
          indexingAttempts: 0,
          indexingNextAttemptAt: new Date(),
          indexingLeaseUntil: null,
          indexingError: null
        },
        select: documentMetadata
      });
      await tx.$executeRaw(
        Prisma.sql`UPDATE "KnowledgeChunk" SET "sourceRevision"="sourceRevision"+1, embedding=NULL, "embeddingModel"=NULL WHERE "documentId"=${id} AND "workspaceId"=${workspaceId}`
      );
      return updated;
    });
  }
  async deleteDocument(id: string, workspaceId: string) {
    const result = await this.prisma.knowledgeDocument.deleteMany({ where: { id, workspaceId } });
    if (!result.count) throw new NotFoundException('Document not found.');
  }
  async reindexDocument(id: string, workspaceId: string) {
    const result = await this.prisma.knowledgeDocument.updateMany({
      where: { id, workspaceId },
      data: {
        indexingStatus: 'PENDING',
        indexingAttempts: 0,
        indexingNextAttemptAt: new Date(),
        indexingLeaseUntil: null,
        indexingError: null
      }
    });
    if (!result.count) throw new NotFoundException('Document not found.');
    return { status: 'PENDING' };
  }

  async relevantFor(query: string, workspaceId = LEGACY_WORKSPACE_ID): Promise<RetrievalResult> {
    if (!this.config.get('RAG_V2_ENABLED', { infer: true }))
      return this.legacyRetrieve(query, workspaceId);
    const started = Date.now();
    let vector: number[] | undefined;
    let fallbackReason: string | undefined;
    try {
      vector = await this.embeddings.embedQuery(query);
    } catch (error) {
      fallbackReason =
        error instanceof Error ? error.message.slice(0, 160) : 'query_embedding_failed';
    }
    const lexical = await this.lexicalCandidates(query, workspaceId);
    let semantic: Candidate[] = [];
    if (vector)
      try {
        semantic = await this.vectorCandidates(vector, workspaceId);
      } catch (error) {
        fallbackReason =
          error instanceof Error ? error.message.slice(0, 160) : 'vector_query_failed';
      }
    const ranked = reciprocalRankFusion([
      lexical,
      semantic.filter((item) => item.semanticScore >= 0.35)
    ]).slice(0, 12);
    const fused = ranked.map((item) => item.item);
    const sources = mergeAdjacent(fused).slice(0, 6);
    let used = 0;
    const budgeted = sources.filter((source) => {
      if (used >= 12_000) return false;
      source.content = source.content.slice(0, 12_000 - used);
      used += source.content.length;
      return true;
    });
    const citations = budgeted.map((source) => ({
      id: source.key,
      label: source.title,
      sourceType: source.sourceType,
      category: source.category
    }));
    void this.prisma.auditLog
      .create({
        data: {
          workspaceId,
          action: 'RAG_RETRIEVAL',
          targetType: 'KNOWLEDGE',
          actorType: 'SYSTEM',
          metadata: {
            mode: semantic.length ? 'hybrid' : 'lexical',
            results: ranked
              .slice(0, 6)
              .map((item) => ({
                sourceId: item.item.sourceId,
                ranks: item.ranks,
                fusionScore: item.score,
                semanticScore: item.item.semanticScore
              })),
            embeddingModel: vector ? this.embeddings.model : null,
            latencyMs: Date.now() - started,
            fallbackReason
          }
        }
      })
      .catch(() => undefined);
    return {
      sources: budgeted,
      citations,
      context: evidenceBlock(budgeted),
      mode: semantic.length ? 'hybrid' : 'lexical',
      fallbackReason
    };
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
    input: { sessionId?: string; name: string; email: string; phone: string; message: string },
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    const handoff = await this.prisma.handoffRequest.create({ data: { ...input, workspaceId } });
    void this.notifications.handoffCreated(workspaceId, handoff);
    return handoff;
  }

  private lexicalCandidates(query: string, workspaceId: string) {
    return this.prisma.$queryRaw<Candidate[]>(
      Prisma.sql`SELECT c.id, COALESCE(c."articleId",c."documentId") AS "sourceId", CASE WHEN c."articleId" IS NULL THEN 'DOCUMENT' ELSE 'ARTICLE' END AS "sourceType", COALESCE(a.slug,'doc-'||d.id) AS key, COALESCE(a.title,d.title) AS title, COALESCE(a.category,d.category) AS category, c.ordinal, c.text AS content, 0::float AS "semanticScore" FROM "KnowledgeChunk" c LEFT JOIN "KnowledgeArticle" a ON a.id=c."articleId" AND a."workspaceId"=${workspaceId} LEFT JOIN "KnowledgeDocument" d ON d.id=c."documentId" AND d."workspaceId"=${workspaceId} WHERE c."workspaceId"=${workspaceId} AND COALESCE(a."isActive",d."isActive")=true AND COALESCE(a.category,d.category)<>'INTERNAL' AND c."sourceRevision"=COALESCE(a."indexingRevision",d."indexingRevision") AND c."searchVector" @@ websearch_to_tsquery('simple',${query}) ORDER BY ts_rank_cd(c."searchVector",websearch_to_tsquery('simple',${query})) DESC LIMIT 20`
    );
  }
  private vectorCandidates(vector: number[], workspaceId: string) {
    const literal = `[${vector.join(',')}]`;
    return this.prisma.$queryRaw<Candidate[]>(
      Prisma.sql`SELECT c.id, COALESCE(c."articleId",c."documentId") AS "sourceId", CASE WHEN c."articleId" IS NULL THEN 'DOCUMENT' ELSE 'ARTICLE' END AS "sourceType", COALESCE(a.slug,'doc-'||d.id) AS key, COALESCE(a.title,d.title) AS title, COALESCE(a.category,d.category) AS category, c.ordinal, c.text AS content, (1-(c.embedding <=> ${literal}::vector))::float AS "semanticScore" FROM "KnowledgeChunk" c LEFT JOIN "KnowledgeArticle" a ON a.id=c."articleId" AND a."workspaceId"=${workspaceId} LEFT JOIN "KnowledgeDocument" d ON d.id=c."documentId" AND d."workspaceId"=${workspaceId} WHERE c."workspaceId"=${workspaceId} AND c.embedding IS NOT NULL AND COALESCE(a."isActive",d."isActive")=true AND COALESCE(a.category,d.category)<>'INTERNAL' AND COALESCE(a."indexingStatus",d."indexingStatus")='READY' AND c."sourceRevision"=COALESCE(a."indexingRevision",d."indexingRevision") ORDER BY c.embedding <=> ${literal}::vector LIMIT 20`
    );
  }
  private async legacyRetrieve(query: string, workspaceId: string): Promise<RetrievalResult> {
    const terms = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    const sources = (await this.list(false, workspaceId))
      .filter((item) => item.category !== 'INTERNAL')
      .map((item) => ({
        id: item.id,
        sourceId: item.id,
        sourceType: 'ARTICLE' as const,
        key: item.slug,
        title: item.title,
        category: item.category,
        ordinal: 0,
        content: item.content,
        semanticScore: 0,
        score: terms.filter((term) => `${item.title} ${item.content}`.toLowerCase().includes(term))
          .length
      }))
      .filter((item) => item.score)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return {
      sources,
      citations: sources.map((item) => ({
        id: item.key,
        label: item.title,
        sourceType: item.sourceType,
        category: item.category
      })),
      context: evidenceBlock(sources),
      mode: 'lexical',
      fallbackReason: 'rag_v2_disabled'
    };
  }
  private async ensureDefaults(workspaceId: string) {
    if (await this.prisma.knowledgeArticle.count({ where: { workspaceId } })) return;
    for (const article of defaults) await this.upsert(article, workspaceId);
  }
}

const articleMetadata = {
  id: true,
  slug: true,
  title: true,
  content: true,
  isActive: true,
  category: true,
  sourceLabel: true,
  indexingStatus: true,
  indexingError: true,
  createdAt: true,
  updatedAt: true
} as const;
const documentMetadata = {
  id: true,
  title: true,
  filename: true,
  mimeType: true,
  category: true,
  byteCount: true,
  pageCount: true,
  isActive: true,
  indexingStatus: true,
  indexingError: true,
  indexingAttempts: true,
  createdAt: true,
  updatedAt: true
} as const;
function mergeAdjacent(items: Candidate[]) {
  const output: Candidate[] = [];
  for (const item of items) {
    const prior = output.find(
      (value) => value.sourceId === item.sourceId && Math.abs(value.ordinal - item.ordinal) === 1
    );
    if (prior) {
      prior.content =
        prior.ordinal < item.ordinal
          ? `${prior.content}\n\n${item.content}`
          : `${item.content}\n\n${prior.content}`;
      prior.ordinal = Math.min(prior.ordinal, item.ordinal);
    } else output.push({ ...item });
  }
  return output;
}
