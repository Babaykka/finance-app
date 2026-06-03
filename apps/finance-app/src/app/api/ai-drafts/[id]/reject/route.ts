import { NextResponse } from "next/server";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const { id } = await context.params;

  const update = await prisma.aiDraft.updateMany({
    where: {
      id,
      ownerId: owner.id,
      status: { in: ["pending", "needs_clarification"] }
    },
    data: { status: "rejected" }
  });

  if (update.count === 0) {
    return NextResponse.json(
      { error: "Draft was not found or is no longer rejectable." },
      { status: 404 }
    );
  }

  const draft = await prisma.aiDraft.findFirstOrThrow({
    where: { id, ownerId: owner.id }
  });

  return NextResponse.json(draft);
}
