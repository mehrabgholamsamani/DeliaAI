ALTER TABLE "BusinessSettings"
  ADD COLUMN "companyDescription" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "greeting" TEXT NOT NULL DEFAULT 'Hello. How can I help you today?',
  ADD COLUMN "assistantTone" TEXT NOT NULL DEFAULT 'warm and professional',
  ADD COLUMN "bookingInstructions" TEXT NOT NULL DEFAULT 'Offer live availability and always ask for confirmation before booking.',
  ADD COLUMN "handoffInstructions" TEXT NOT NULL DEFAULT 'Offer a human handoff when the answer is not in approved knowledge.',
  ADD COLUMN "contactDetails" TEXT NOT NULL DEFAULT '';

ALTER TABLE "KnowledgeArticle"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'FAQ',
  ADD COLUMN "sourceLabel" TEXT;

CREATE TABLE "ReceptionistFeedback" (
  "id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "sessionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceptionistFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReceptionistFeedback_status_createdAt_idx" ON "ReceptionistFeedback"("status", "createdAt");
