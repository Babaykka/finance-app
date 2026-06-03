import { prisma } from "@/server/db";
import { ensureOwner } from "@/server/services/owner-service";

export async function getLocalOwner() {
  const telegramUserId = process.env.OWNER_TELEGRAM_USER_ID;

  if (!telegramUserId) {
    throw new Error("OWNER_TELEGRAM_USER_ID is required");
  }

  return ensureOwner(prisma, {
    telegramUserId,
    displayName: process.env.OWNER_DISPLAY_NAME ?? "Owner"
  });
}
