CREATE TYPE "ReceptionistAction" AS ENUM ('CREATE_BOOKING', 'UPDATE_BOOKING', 'CANCEL_BOOKING');
CREATE TYPE "ReceptionistDraftStatus" AS ENUM ('PENDING_CONFIRMATION', 'EXECUTED', 'EXPIRED');

CREATE TABLE "ReceptionistActionDraft" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "action" "ReceptionistAction" NOT NULL, "payload" JSONB NOT NULL,
  "status" "ReceptionistDraftStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION', "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceptionistActionDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReceptionistActionDraft_sessionId_status_expiresAt_idx" ON "ReceptionistActionDraft"("sessionId", "status", "expiresAt");
