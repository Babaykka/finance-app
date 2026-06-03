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

  await prisma.aiDraft.updateMany({
    where: { id, ownerId: owner.id },
    data: { status: "rejected" }
  });

  const draft = await prisma.aiDraft.findFirstOrThrow({
    where: { id, ownerId: owner.id }
  });

  return NextResponse.json(draft);
}
