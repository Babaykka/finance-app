import { NextResponse } from "next/server";
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

const debtKey = (partyName: string, basis: string) => `${partyName}\u0000${basis}`;

const toUtcDate = (dateIso: string) => new Date(`${dateIso}T00:00:00.000Z`);

export async function POST() {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const seed = buildCurrentFinanceSeed(new Date().toISOString().slice(0, 10));
  const [existingStoragePlaces, existingDebts] = await Promise.all([
    prisma.storagePlace.findMany({
      where: { ownerId: owner.id },
      select: { name: true }
    }),
    prisma.debt.findMany({
      where: { ownerId: owner.id },
      select: { partyName: true, basis: true }
    })
  ]);
  const existingStorageNames = new Set(existingStoragePlaces.map((place) => place.name));
  const existingDebtKeys = new Set(
    existingDebts.map((debt) => debtKey(debt.partyName, debt.basis))
  );
  let createdStoragePlaces = 0;
  let skippedStoragePlaces = 0;
  let createdDebts = 0;
  let skippedDebts = 0;

  for (const place of seed.storagePlaces) {
    if (existingStorageNames.has(place.name)) {
      skippedStoragePlaces += 1;
      continue;
    }

    await createStoragePlace(prisma, {
      ...place,
      ownerId: owner.id,
      actor: IMPORT_ACTOR,
      source: "import"
    });
    existingStorageNames.add(place.name);
    createdStoragePlaces += 1;
  }

  for (const debt of seed.debts) {
    const key = debtKey(debt.partyName, debt.basis);

    if (existingDebtKeys.has(key)) {
      skippedDebts += 1;
      continue;
    }

    const { nextPaymentDate, ...debtInput } = debt;
    await createDebtWithOptionalPlan(prisma, {
      ...debtInput,
      ownerId: owner.id,
      actor: IMPORT_ACTOR,
      source: "import",
      ...(nextPaymentDate ? { nextPaymentDate: toUtcDate(nextPaymentDate) } : {})
    });
    existingDebtKeys.add(key);
    createdDebts += 1;
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
