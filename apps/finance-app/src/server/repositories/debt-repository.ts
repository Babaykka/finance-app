import type { PrismaClient } from "@prisma/client";

type DebtDb = {
  debt: Pick<PrismaClient["debt"], "findMany" | "findFirst">;
};

export const createDebtRepository = (db: DebtDb) => ({
  listByOwner: (ownerId: string) =>
    db.debt.findMany({
      where: { ownerId },
      include: { payments: true },
      orderBy: [{ nextPaymentDate: "asc" }, { partyName: "asc" }]
    }),

  findByParty: (ownerId: string, partyName: string) =>
    db.debt.findFirst({
      where: { ownerId, partyName },
      include: { payments: true }
    })
});
