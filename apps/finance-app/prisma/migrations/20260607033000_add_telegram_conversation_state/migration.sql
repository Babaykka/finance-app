-- CreateTable
CREATE TABLE "TelegramConversationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConversationState_telegramUserId_key" ON "TelegramConversationState"("telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramConversationState_expiresAt_idx" ON "TelegramConversationState"("expiresAt");
