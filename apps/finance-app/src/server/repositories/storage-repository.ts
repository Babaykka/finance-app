import type { PrismaClient } from "@prisma/client";

type StorageDb = {
  storagePlace: Pick<PrismaClient["storagePlace"], "findMany" | "findFirst">;
};

export const createStorageRepository = (db: StorageDb) => ({
  listByOwner: (ownerId: string) =>
    db.storagePlace.findMany({
      where: { ownerId },
      orderBy: [{ attentionPriority: "desc" }, { name: "asc" }]
    }),

  findByName: (ownerId: string, name: string) =>
    db.storagePlace.findFirst({
      where: { ownerId, name }
    })
});
