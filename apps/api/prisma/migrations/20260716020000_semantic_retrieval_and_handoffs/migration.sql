ALTER TABLE "KnowledgeArticle" ADD COLUMN "embedding" JSONB;

CREATE TABLE "HandoffRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "sessionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HandoffRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HandoffRequest_status_createdAt_idx" ON "HandoffRequest"("status", "createdAt");
