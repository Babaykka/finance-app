import { NextResponse } from "next/server";

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
  const drafts = await prisma.aiDraft.findMany({
    where: { ownerId: owner.id, status: { in: ["pending", "needs_clarification"] } },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(drafts);
}
