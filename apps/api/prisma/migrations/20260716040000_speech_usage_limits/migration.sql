CREATE TABLE "SpeechUsageRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "characters" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeechUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpeechUsageRecord_createdAt_idx" ON "SpeechUsageRecord"("createdAt");
CREATE INDEX "SpeechUsageRecord_sessionId_createdAt_idx" ON "SpeechUsageRecord"("sessionId", "createdAt");

ALTER TABLE "SpeechUsageRecord"
ADD CONSTRAINT "SpeechUsageRecord_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
