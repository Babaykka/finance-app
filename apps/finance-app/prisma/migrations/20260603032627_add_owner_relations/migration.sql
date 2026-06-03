-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Decision" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Decision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Decision" ("action", "amountOrAsset", "area", "comment", "createdAt", "date", "id", "ownerId", "priority", "reason", "status", "updatedAt") SELECT "action", "amountOrAsset", "area", "comment", "createdAt", "date", "id", "ownerId", "priority", "reason", "status", "updatedAt" FROM "Decision";
DROP TABLE "Decision";
ALTER TABLE "new_Decision" RENAME TO "Decision";
CREATE INDEX "Decision_ownerId_date_idx" ON "Decision"("ownerId", "date");
CREATE INDEX "Decision_ownerId_status_idx" ON "Decision"("ownerId", "status");
CREATE TABLE "new_ExpensePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "plannedAmount" DECIMAL NOT NULL,
    "actualEstimate" DECIMAL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpensePlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExpensePlan" ("actualEstimate", "asset", "comment", "createdAt", "id", "ownerId", "period", "plannedAmount", "status", "updatedAt") SELECT "actualEstimate", "asset", "comment", "createdAt", "id", "ownerId", "period", "plannedAmount", "status", "updatedAt" FROM "ExpensePlan";
DROP TABLE "ExpensePlan";
ALTER TABLE "new_ExpensePlan" RENAME TO "ExpensePlan";
CREATE INDEX "ExpensePlan_ownerId_period_idx" ON "ExpensePlan"("ownerId", "period");
CREATE INDEX "ExpensePlan_ownerId_status_idx" ON "ExpensePlan"("ownerId", "status");
CREATE TABLE "new_MajorMovement" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MajorMovement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MajorMovement_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MajorMovement" ("amount", "asset", "comment", "createdAt", "date", "debtId", "fromPlace", "id", "ownerId", "toPlace", "type") SELECT "amount", "asset", "comment", "createdAt", "date", "debtId", "fromPlace", "id", "ownerId", "toPlace", "type" FROM "MajorMovement";
DROP TABLE "MajorMovement";
ALTER TABLE "new_MajorMovement" RENAME TO "MajorMovement";
CREATE INDEX "MajorMovement_ownerId_date_idx" ON "MajorMovement"("ownerId", "date");
CREATE INDEX "MajorMovement_ownerId_type_idx" ON "MajorMovement"("ownerId", "type");
CREATE INDEX "MajorMovement_debtId_idx" ON "MajorMovement"("debtId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
