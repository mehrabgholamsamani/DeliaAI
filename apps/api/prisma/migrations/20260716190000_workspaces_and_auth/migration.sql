-- Preserve all existing single-business data in an explicit legacy workspace.
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Workspace" ("id", "name", "updatedAt")
VALUES ('legacy', 'Legacy demo workspace', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BusinessSettings" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "BusinessSettings" ADD COLUMN "industry" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Service" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Customer" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Booking" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "AvailabilityOverride" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "AuditLog" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "KnowledgeArticle" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "HandoffRequest" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "ReceptionistFeedback" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "ConversationSession" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy';

DROP INDEX IF EXISTS "Service_slug_key";
DROP INDEX IF EXISTS "Customer_email_key";
DROP INDEX IF EXISTS "AvailabilityOverride_slotStartAt_key";
DROP INDEX IF EXISTS "KnowledgeArticle_slug_key";

CREATE UNIQUE INDEX "BusinessSettings_workspaceId_key" ON "BusinessSettings"("workspaceId");
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");
CREATE UNIQUE INDEX "UserAccount_workspaceId_key" ON "UserAccount"("workspaceId");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE UNIQUE INDEX "Service_workspaceId_slug_key" ON "Service"("workspaceId", "slug");
CREATE UNIQUE INDEX "Customer_workspaceId_email_key" ON "Customer"("workspaceId", "email");
CREATE UNIQUE INDEX "AvailabilityOverride_workspaceId_slotStartAt_key" ON "AvailabilityOverride"("workspaceId", "slotStartAt");
CREATE UNIQUE INDEX "KnowledgeArticle_workspaceId_slug_key" ON "KnowledgeArticle"("workspaceId", "slug");

ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HandoffRequest" ADD CONSTRAINT "HandoffRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceptionistFeedback" ADD CONSTRAINT "ReceptionistFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
