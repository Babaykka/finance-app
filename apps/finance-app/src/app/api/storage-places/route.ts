import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CreateStoragePlaceSchema,
  createStoragePlace
} from "@/server/services/storage-service";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

export const CreateStoragePlaceApiSchema = CreateStoragePlaceSchema.omit({
  ownerId: true,
  actor: true,
  source: true,
  reviewOrEndDate: true,
  lastCheckedAt: true
}).extend({
  reviewOrEndDate: z.string().datetime().optional(),
  lastCheckedAt: z.string().datetime().optional()
});

export async function GET() {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const storagePlaces = await prisma.storagePlace.findMany({
    where: { ownerId: owner.id },
    orderBy: { name: "asc" }
  });

  return NextResponse.json(storagePlaces);
}

export async function POST(request: Request) {
  const { reviewOrEndDate, lastCheckedAt, ...input } = CreateStoragePlaceApiSchema.parse(
    await request.json()
  );
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const created = await createStoragePlace(prisma, {
    ...input,
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web",
    ...(reviewOrEndDate ? { reviewOrEndDate: new Date(reviewOrEndDate) } : {}),
    ...(lastCheckedAt ? { lastCheckedAt: new Date(lastCheckedAt) } : {})
  });

  return NextResponse.json(created, { status: 201 });
}
