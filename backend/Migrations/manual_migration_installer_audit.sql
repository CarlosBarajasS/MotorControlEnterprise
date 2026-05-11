-- Migration: AddInstallerOwnershipAndAuditLog
-- Applied: 2026-05-10
-- Method: SQL directo (dotnet ef no disponible localmente; EF migration .cs generada manualmente)

-- 1. Add installer_created_by_id to Clients
ALTER TABLE "Clients"
  ADD COLUMN IF NOT EXISTS installer_created_by_id INTEGER
  REFERENCES "Users"("Id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "IX_Clients_installer_created_by_id"
  ON "Clients"(installer_created_by_id);

-- 2. Create AuditLogs table
CREATE TABLE IF NOT EXISTS "AuditLogs" (
  "Id"         SERIAL PRIMARY KEY,
  "UserId"     INTEGER NOT NULL REFERENCES "Users"("Id") ON DELETE NO ACTION,
  "Action"     VARCHAR(50) NOT NULL,
  "EntityType" VARCHAR(30) NOT NULL,
  "EntityId"   INTEGER,
  "Details"    JSONB,
  "CreatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes on AuditLogs
CREATE INDEX IF NOT EXISTS "IX_AuditLogs_UserId"    ON "AuditLogs"("UserId");
CREATE INDEX IF NOT EXISTS "IX_AuditLogs_Action"    ON "AuditLogs"("Action");
CREATE INDEX IF NOT EXISTS "IX_AuditLogs_CreatedAt" ON "AuditLogs"("CreatedAt" DESC);
