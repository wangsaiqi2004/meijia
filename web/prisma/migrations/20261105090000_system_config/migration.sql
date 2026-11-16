CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT
);
CREATE INDEX "SystemConfig_updatedAt_idx" ON "SystemConfig"("updatedAt");
CREATE TABLE "ConfigAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "operatorId" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConfigAudit_createdAt_idx" ON "ConfigAudit"("createdAt");
CREATE INDEX "ConfigAudit_configKey_createdAt_idx" ON "ConfigAudit"("configKey", "createdAt");
