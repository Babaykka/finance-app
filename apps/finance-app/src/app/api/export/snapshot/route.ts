import { NextResponse } from "next/server";
import { buildExportSnapshot } from "@/server/export/snapshot";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

export async function GET() {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const [storagePlaces, debts, payments] = await Promise.all([
    prisma.storagePlace.findMany({
      where: { ownerId: owner.id },
      select: {
        name: true,
        asset: true,
        amount: true
      },
      orderBy: { name: "asc" }
    }),
    prisma.debt.findMany({
      where: { ownerId: owner.id },
      select: {
        partyName: true,
        asset: true,
        remainingAmount: true
      },
      orderBy: { partyName: "asc" }
    }),
    prisma.debtPayment.findMany({
      where: { ownerId: owner.id },
      select: {
        paymentDate: true,
        amount: true,
        asset: true,
        status: true
      },
      orderBy: { paymentDate: "asc" }
    })
  ]);

  return NextResponse.json(buildExportSnapshot({ storagePlaces, debts, payments }));
}
