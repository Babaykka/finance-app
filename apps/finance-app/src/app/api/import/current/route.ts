import { NextResponse } from "next/server";
import { dateToMoscowDateIso } from "@/domain/dates";
import { buildCurrentFinanceSeed } from "@/server/import/current-finance-seed";
import { createDebtWithOptionalPlan } from "@/server/services/debt-service";
import { createStoragePlace } from "@/server/services/storage-service";

const IMPORT_ACTOR = "import:current-finance-seed";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

const toUtcDate = (dateIso: string) => new Date(`${dateIso}T00:00:00.000Z`);

const isUniqueConstraintError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "P2002";

export async function POST() {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const seed = buildCurrentFinanceSeed(dateToMoscowDateIso());
  let createdStoragePlaces = 0;
  let skippedStoragePlaces = 0;
  let createdDebts = 0;
  let skippedDebts = 0;

  for (const place of seed.storagePlaces) {
    try {
      await createStoragePlace(prisma, {
        ...place,
        ownerId: owner.id,
        actor: IMPORT_ACTOR,
        source: "import"
      });
      createdStoragePlaces += 1;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      skippedStoragePlaces += 1;
    }
  }

  for (const debt of seed.debts) {
    const { nextPaymentDate, ...debtInput } = debt;

    try {
      await createDebtWithOptionalPlan(prisma, {
        ...debtInput,
        ownerId: owner.id,
        actor: IMPORT_ACTOR,
        source: "import",
        ...(nextPaymentDate ? { nextPaymentDate: toUtcDate(nextPaymentDate) } : {})
      });
      createdDebts += 1;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      skippedDebts += 1;
    }
  }

  return NextResponse.json({
    importedAt: seed.importedAt,
    storagePlaces: {
      created: createdStoragePlaces,
      skipped: skippedStoragePlaces
    },
    debts: {
      created: createdDebts,
      skipped: skippedDebts
    }
  });
}
