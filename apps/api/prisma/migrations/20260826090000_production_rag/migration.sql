CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "KnowledgeIndexingStatus" AS ENUM ('PENDING', 'INDEXING', 'READY', 'FAILED');

ALTER TABLE "KnowledgeArticle"
  ADD COLUMN "indexingStatus" "KnowledgeIndexingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "indexingRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "indexingAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "indexingNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "indexingLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "indexingError" TEXT;

CREATE UNIQUE INDEX "KnowledgeArticle_id_workspaceId_key" ON "KnowledgeArticle"("id", "workspaceId");
CREATE INDEX "KnowledgeArticle_workspaceId_indexingStatus_indexingNextAttemptAt_idx" ON "KnowledgeArticle"("workspaceId", "indexingStatus", "indexingNextAttemptAt");

CREATE TABLE "KnowledgeDocument" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "filename" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'FAQ',
  "extractedText" TEXT NOT NULL, "byteCount" INTEGER NOT NULL, "pageCount" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "indexingStatus" "KnowledgeIndexingStatus" NOT NULL DEFAULT 'PENDING',
  "indexingRevision" INTEGER NOT NULL DEFAULT 1, "indexingAttempts" INTEGER NOT NULL DEFAULT 0,
  "indexingNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "indexingLeaseUntil" TIMESTAMP(3), "indexingError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeDocument_id_workspaceId_key" ON "KnowledgeDocument"("id", "workspaceId");
CREATE INDEX "KnowledgeDocument_workspaceId_indexingStatus_indexingNextAttemptAt_idx" ON "KnowledgeDocument"("workspaceId", "indexingStatus", "indexingNextAttemptAt");

CREATE TABLE "KnowledgeChunk" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "articleId" TEXT, "documentId" TEXT,
  "sourceRevision" INTEGER NOT NULL, "ordinal" INTEGER NOT NULL, "text" TEXT NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "text")) STORED,
  "embedding" vector(768), "embeddingModel" TEXT, "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeChunk_one_source" CHECK (("articleId" IS NOT NULL)::int + ("documentId" IS NOT NULL)::int = 1),
  CONSTRAINT "KnowledgeChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "KnowledgeChunk_article_workspace_fkey" FOREIGN KEY ("articleId", "workspaceId") REFERENCES "KnowledgeArticle"("id", "workspaceId") ON DELETE CASCADE,
  CONSTRAINT "KnowledgeChunk_document_workspace_fkey" FOREIGN KEY ("documentId", "workspaceId") REFERENCES "KnowledgeDocument"("id", "workspaceId") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeChunk_article_revision_ordinal_key" ON "KnowledgeChunk"("articleId", "sourceRevision", "ordinal");
CREATE UNIQUE INDEX "KnowledgeChunk_document_revision_ordinal_key" ON "KnowledgeChunk"("documentId", "sourceRevision", "ordinal");
CREATE INDEX "KnowledgeChunk_workspace_article_revision_idx" ON "KnowledgeChunk"("workspaceId", "articleId", "sourceRevision");
CREATE INDEX "KnowledgeChunk_workspace_document_revision_idx" ON "KnowledgeChunk"("workspaceId", "documentId", "sourceRevision");
CREATE INDEX "KnowledgeChunk_searchVector_gin_idx" ON "KnowledgeChunk" USING GIN ("searchVector");

-- Existing articles are intentionally queued for the same durable backfill worker.
UPDATE "KnowledgeArticle" SET "indexingStatus" = 'PENDING', "indexingNextAttemptAt" = CURRENT_TIMESTAMP;
