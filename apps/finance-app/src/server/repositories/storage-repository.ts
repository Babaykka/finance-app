import type { PrismaClient } from "@prisma/client";
import type { AttentionPriority } from "@/domain/enums";

type StorageDb = {
  storagePlace: Pick<PrismaClient["storagePlace"], "findMany" | "findFirst">;
};

const attentionPriorityRank: Record<AttentionPriority, number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  low: 0
};

const sortByAttentionPriority = <T extends { attentionPriority: string }>(rows: T[]) =>
  [...rows].sort((left, right) => {
    const leftRank = attentionPriorityRank[left.attentionPriority as AttentionPriority] ?? -1;
    const rightRank = attentionPriorityRank[right.attentionPriority as AttentionPriority] ?? -1;
    return rightRank - leftRank;
  });

export const createStorageRepository = (db: StorageDb) => ({
  listByOwner: async (ownerId: string) =>
    sortByAttentionPriority(
      await db.storagePlace.findMany({
        where: { ownerId },
        orderBy: [{ attentionPriority: "desc" }, { name: "asc" }]
      })
    ),

  findByName: (ownerId: string, name: string) =>
    db.storagePlace.findFirst({
      where: { ownerId, name }
    })
});
