import { NextResponse } from "next/server";
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

const CreateStoragePlaceApiSchema = CreateStoragePlaceSchema.omit({
  ownerId: true,
  actor: true,
  source: true
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
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const input = CreateStoragePlaceApiSchema.parse(await request.json());
  const created = await createStoragePlace(prisma, {
    ...input,
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web"
  });

  return NextResponse.json(created, { status: 201 });
}
