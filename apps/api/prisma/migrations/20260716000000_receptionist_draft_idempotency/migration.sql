ALTER TYPE "ReceptionistDraftStatus" ADD VALUE 'EXECUTING';

ALTER TABLE "ReceptionistActionDraft" ADD COLUMN "executionResult" JSONB;
