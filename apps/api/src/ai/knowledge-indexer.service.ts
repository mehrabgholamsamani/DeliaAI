import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Environment } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { GeminiEmbeddingProvider } from './embedding.service.js';
import { chunkKnowledge, retryAt } from './rag.utils.js';

type Source = {
  id: string;
  workspaceId: string;
  title: string;
  text: string;
  revision: number;
  attempts: number;
  kind: 'article' | 'document';
};

@Injectable()
export class KnowledgeIndexerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly embeddings: GeminiEmbeddingProvider
  ) {}
  onModuleInit() {
    if (!this.config.get('RAG_INDEXER_ENABLED', { infer: true })) return;
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const source = await this.lease();
      if (source) await this.index(source);
    } finally {
      this.running = false;
    }
  }
  private async lease(): Promise<Source | undefined> {
    const now = new Date();
    const leaseUntil = new Date(Date.now() + 2 * 60_000);
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: {
        indexingStatus: { in: ['PENDING', 'INDEXING'] },
        indexingNextAttemptAt: { lte: now },
        OR: [{ indexingLeaseUntil: null }, { indexingLeaseUntil: { lt: now } }]
      },
      orderBy: { indexingNextAttemptAt: 'asc' }
    });
    if (article) {
      const claimed = await this.prisma.knowledgeArticle.updateMany({
        where: {
          id: article.id,
          indexingRevision: article.indexingRevision,
          OR: [{ indexingLeaseUntil: null }, { indexingLeaseUntil: { lt: now } }]
        },
        data: { indexingStatus: 'INDEXING', indexingLeaseUntil: leaseUntil }
      });
      if (claimed.count)
        return {
          id: article.id,
          workspaceId: article.workspaceId,
          title: article.title,
          text: `${article.title}\n\n${article.content}`,
          revision: article.indexingRevision,
          attempts: article.indexingAttempts,
          kind: 'article'
        };
    }
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: {
        indexingStatus: { in: ['PENDING', 'INDEXING'] },
        indexingNextAttemptAt: { lte: now },
        OR: [{ indexingLeaseUntil: null }, { indexingLeaseUntil: { lt: now } }]
      },
      orderBy: { indexingNextAttemptAt: 'asc' }
    });
    if (document) {
      const claimed = await this.prisma.knowledgeDocument.updateMany({
        where: {
          id: document.id,
          indexingRevision: document.indexingRevision,
          OR: [{ indexingLeaseUntil: null }, { indexingLeaseUntil: { lt: now } }]
        },
        data: { indexingStatus: 'INDEXING', indexingLeaseUntil: leaseUntil }
      });
      if (claimed.count)
        return {
          id: document.id,
          workspaceId: document.workspaceId,
          title: document.title,
          text: document.extractedText,
          revision: document.indexingRevision,
          attempts: document.indexingAttempts,
          kind: 'document'
        };
    }
  }
  private async index(source: Source) {
    try {
      const chunks = chunkKnowledge(source.text);
      const vectors = await this.embeddings.embedDocuments(
        chunks.map((item) => item.text),
        source.title
      );
      await this.prisma.$transaction(async (tx) => {
        const relation =
          source.kind === 'article' ? { articleId: source.id } : { documentId: source.id };
        await tx.knowledgeChunk.deleteMany({ where: relation });
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index];
          const rows = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`INSERT INTO "KnowledgeChunk" (id,"workspaceId","articleId","documentId","sourceRevision",ordinal,text,"embedding","embeddingModel","contentHash","createdAt") VALUES (${crypto.randomUUID()},${source.workspaceId},${source.kind === 'article' ? source.id : null},${source.kind === 'document' ? source.id : null},${source.revision},${chunk.ordinal},${chunk.text},${`[${vectors[index].join(',')}]`}::vector,${this.embeddings.model},${chunk.contentHash},NOW()) RETURNING id`
          );
          if (!rows.length) throw new Error('Chunk insert failed.');
        }
        if (source.kind === 'article')
          await tx.knowledgeArticle.updateMany({
            where: { id: source.id, indexingRevision: source.revision },
            data: {
              indexingStatus: 'READY',
              indexingAttempts: 0,
              indexingLeaseUntil: null,
              indexingError: null
            }
          });
        else
          await tx.knowledgeDocument.updateMany({
            where: { id: source.id, indexingRevision: source.revision },
            data: {
              indexingStatus: 'READY',
              indexingAttempts: 0,
              indexingLeaseUntil: null,
              indexingError: null
            }
          });
      });
    } catch (error) {
      const attempts = source.attempts + 1;
      const data = {
        indexingStatus: attempts >= 5 ? ('FAILED' as const) : ('PENDING' as const),
        indexingAttempts: attempts,
        indexingNextAttemptAt: retryAt(attempts),
        indexingLeaseUntil: null,
        indexingError: (error instanceof Error ? error.message : 'Indexing failed').slice(0, 1000)
      };
      if (source.kind === 'article')
        await this.prisma.knowledgeArticle.updateMany({
          where: { id: source.id, indexingRevision: source.revision },
          data
        });
      else
        await this.prisma.knowledgeDocument.updateMany({
          where: { id: source.id, indexingRevision: source.revision },
          data
        });
    }
  }
}
