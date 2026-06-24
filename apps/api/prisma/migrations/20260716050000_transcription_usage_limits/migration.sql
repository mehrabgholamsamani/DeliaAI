CREATE TABLE "TranscriptionUsageRecord" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT,
  "seconds" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranscriptionUsageRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TranscriptionUsageRecord_createdAt_idx" ON "TranscriptionUsageRecord"("createdAt");
ALTER TABLE "TranscriptionUsageRecord" ADD CONSTRAINT "TranscriptionUsageRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
