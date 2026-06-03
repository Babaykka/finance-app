import type { PrismaClient } from "@prisma/client";

type OwnerDb = {
  owner: Pick<PrismaClient["owner"], "findUnique" | "create">;
};

export type EnsureOwnerInput = {
  telegramUserId: string;
  displayName: string;
};

export const ensureOwner = async (
  db: OwnerDb,
  { telegramUserId, displayName }: EnsureOwnerInput
) => {
  const existingOwner = await db.owner.findUnique({
    where: { telegramUserId }
  });

  if (existingOwner) {
    return existingOwner;
  }

  return db.owner.create({
    data: { telegramUserId, displayName }
  });
};
