-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoragePlace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "holderContext" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "amountKind" TEXT NOT NULL DEFAULT 'exact',
    "availability" TEXT NOT NULL,
    "rate" DECIMAL,
    "interestRule" TEXT,
    "interestPaymentDay" INTEGER,
    "reviewOrEndDate" DATETIME,
    "lastCheckedAt" DATETIME,
    "status" TEXT NOT NULL,
    "attentionPriority" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoragePlace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "originalAmount" DECIMAL NOT NULL,
    "remainingAmount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "nextPaymentAmount" DECIMAL,
    "nextPaymentDate" DATETIME,
    "attentionPriority" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Debt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "asset" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DebtPayment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MajorMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "asset" TEXT NOT NULL,
    "fromPlace" TEXT,
    "toPlace" TEXT,
    "debtId" TEXT,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExpensePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "plannedAmount" DECIMAL NOT NULL,
    "actualEstimate" DECIMAL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountOrAsset" TEXT,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "transcript" TEXT,
    "parsedActions" JSONB NOT NULL,
    "confidence" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "AiDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "aiDraftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "spreadsheetUrl" TEXT,
    "error" TEXT,
    CONSTRAINT "ExportJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_telegramUserId_key" ON "Owner"("telegramUserId");

-- CreateIndex
CREATE INDEX "StoragePlace_ownerId_type_idx" ON "StoragePlace"("ownerId", "type");

-- CreateIndex
CREATE INDEX "StoragePlace_ownerId_status_idx" ON "StoragePlace"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Debt_ownerId_status_idx" ON "Debt"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Debt_ownerId_type_idx" ON "Debt"("ownerId", "type");

-- CreateIndex
CREATE INDEX "DebtPayment_ownerId_paymentDate_idx" ON "DebtPayment"("ownerId", "paymentDate");

-- CreateIndex
CREATE INDEX "DebtPayment_debtId_recordType_idx" ON "DebtPayment"("debtId", "recordType");

-- CreateIndex
CREATE INDEX "AiDraft_ownerId_status_idx" ON "AiDraft"("ownerId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_ownerId_createdAt_idx" ON "AuditLog"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
