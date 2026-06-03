import type { PrismaClient } from "@prisma/client";

type OwnerDb = {
  owner: Pick<PrismaClient["owner"], "upsert">;
};

export type EnsureOwnerInput = {
  telegramUserId: string;
  displayName: string;
};

export const ensureOwner = async (
  db: OwnerDb,
  { telegramUserId, displayName }: EnsureOwnerInput
) =>
  db.owner.upsert({
    where: { telegramUserId },
    update: {},
    create: { telegramUserId, displayName }
  });
