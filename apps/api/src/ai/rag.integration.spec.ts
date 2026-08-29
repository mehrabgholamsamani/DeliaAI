import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const enabled = Boolean(process.env.DATABASE_URL);
const prisma = new PrismaClient();
const workspaceA = 'rag-test-workspace-a';
const workspaceB = 'rag-test-workspace-b';

describe.skipIf(!enabled)('pgvector RAG integration', () => {
  beforeAll(async () => {
    await prisma.workspace.createMany({
      data: [
        { id: workspaceA, name: 'RAG Test A' },
        { id: workspaceB, name: 'RAG Test B' }
      ],
      skipDuplicates: true
    });
    await prisma.knowledgeArticle.createMany({
      data: [
        { id: 'rag-article-a', workspaceId: workspaceA, slug: 'shared', title: 'Cancellation', content: 'The cobalt cancellation window is 24 hours.', category: 'POLICY', indexingStatus: 'READY' },
        { id: 'rag-internal-a', workspaceId: workspaceA, slug: 'internal', title: 'Staff secret', content: 'The internal marker is marigold.', category: 'INTERNAL', indexingStatus: 'READY' },
        { id: 'rag-article-b', workspaceId: workspaceB, slug: 'shared', title: 'Cancellation', content: 'The scarlet cancellation window is 72 hours.', category: 'POLICY', indexingStatus: 'READY' }
      ],
      skipDuplicates: true
    });
    const zero = `[${Array(768).fill(0).join(',')}]`;
    const one = `[1,${Array(767).fill(0).join(',')}]`;
    const near = `[0.9,0.1,${Array(766).fill(0).join(',')}]`;
    await prisma.$executeRawUnsafe(`INSERT INTO "KnowledgeChunk" (id,"workspaceId","articleId","sourceRevision",ordinal,text,embedding,"embeddingModel","contentHash","createdAt") VALUES
      ('rag-chunk-a','${workspaceA}','rag-article-a',1,0,'The cobalt cancellation window is 24 hours.','${one}'::vector,'test','a',NOW()),
      ('rag-chunk-internal','${workspaceA}','rag-internal-a',1,0,'The internal marker is marigold.','${zero}'::vector,'test','b',NOW()),
      ('rag-chunk-b','${workspaceB}','rag-article-b',1,0,'The scarlet cancellation window is 72 hours.','${near}'::vector,'test','c',NOW())
      ON CONFLICT (id) DO NOTHING`);
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await prisma.$disconnect();
  });

  it('has pgvector and the expected 768-dimensional column', async () => {
    const rows = await prisma.$queryRaw<{ extension: string; dimensions: number }[]>`
      SELECT extname AS extension, atttypmod AS dimensions FROM pg_extension,
      pg_attribute WHERE extname='vector' AND attrelid='"KnowledgeChunk"'::regclass AND attname='embedding'`;
    expect(rows[0]).toEqual({ extension: 'vector', dimensions: 768 });
  });
  it('isolates identical source IDs lexically and excludes INTERNAL content', async () => {
    const rows = await prisma.$queryRaw<{ text: string }[]>`
      SELECT c.text FROM "KnowledgeChunk" c JOIN "KnowledgeArticle" a
      ON a.id=c."articleId" AND a."workspaceId"=${workspaceA}
      WHERE c."workspaceId"=${workspaceA} AND a."isActive" AND a.category<>'INTERNAL'
      AND c."searchVector" @@ websearch_to_tsquery('simple','cancellation window')`;
    expect(rows.map((row) => row.text)).toEqual(['The cobalt cancellation window is 24 hours.']);
  });
  it('orders exact cosine matches first without crossing workspaces', async () => {
    const query = `[1,${Array(767).fill(0).join(',')}]`;
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "KnowledgeChunk" WHERE "workspaceId"='${workspaceA}' AND embedding IS NOT NULL ORDER BY embedding <=> '${query}'::vector LIMIT 2`);
    expect(rows[0].id).toBe('rag-chunk-a');
    expect(rows.some((row) => row.id === 'rag-chunk-b')).toBe(false);
  });
  it('rejects chunks with zero or multiple sources', async () => {
    await expect(prisma.$executeRawUnsafe(`INSERT INTO "KnowledgeChunk" (id,"workspaceId","sourceRevision",ordinal,text,"contentHash","createdAt") VALUES ('bad-no-source','${workspaceA}',1,0,'bad','bad',NOW())`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`INSERT INTO "KnowledgeChunk" (id,"workspaceId","articleId","documentId","sourceRevision",ordinal,text,"contentHash","createdAt") VALUES ('bad-two-sources','${workspaceA}','rag-article-a','missing',1,0,'bad','bad',NOW())`)).rejects.toThrow();
  });
  it('cascades source deletion to chunks', async () => {
    await prisma.knowledgeArticle.delete({ where: { id: 'rag-internal-a' } });
    expect(await prisma.knowledgeChunk.count({ where: { id: 'rag-chunk-internal' } })).toBe(0);
  });
});
