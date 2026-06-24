CREATE TABLE "PublicReceptionist" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "greeting" TEXT NOT NULL DEFAULT '',
  "brandColor" TEXT NOT NULL DEFAULT '#111210',
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicReceptionist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicWidgetSession" (
  "id" TEXT NOT NULL,
  "publicReceptionistId" TEXT NOT NULL,
  "conversationSessionId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicWidgetSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicReceptionist_workspaceId_key" ON "PublicReceptionist"("workspaceId");
CREATE UNIQUE INDEX "PublicReceptionist_publicKey_key" ON "PublicReceptionist"("publicKey");
CREATE UNIQUE INDEX "PublicWidgetSession_conversationSessionId_key" ON "PublicWidgetSession"("conversationSessionId");
CREATE INDEX "PublicWidgetSession_publicReceptionistId_createdAt_idx" ON "PublicWidgetSession"("publicReceptionistId", "createdAt");
ALTER TABLE "PublicReceptionist" ADD CONSTRAINT "PublicReceptionist_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicWidgetSession" ADD CONSTRAINT "PublicWidgetSession_publicReceptionistId_fkey" FOREIGN KEY ("publicReceptionistId") REFERENCES "PublicReceptionist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicWidgetSession" ADD CONSTRAINT "PublicWidgetSession_conversationSessionId_fkey" FOREIGN KEY ("conversationSessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
