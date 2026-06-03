import { NextResponse } from "next/server";
import { buildDashboardSummary } from "@/server/services/dashboard-service";

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
  const [storagePlaces, debts, drafts] = await prisma.$transaction([
    prisma.storagePlace.findMany({
      where: { ownerId: owner.id },
      orderBy: { name: "asc" }
    }),
    prisma.debt.findMany({
      where: { ownerId: owner.id },
      orderBy: [{ nextPaymentDate: "asc" }, { partyName: "asc" }]
    }),
    prisma.aiDraft.findMany({
      where: { ownerId: owner.id, status: "pending" },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return NextResponse.json(buildDashboardSummary({ storagePlaces, debts, drafts }));
}
