import { NextResponse } from "next/server";
import { z } from "zod";
import { CreateDebtSchema, createDebtWithOptionalPlan } from "@/server/services/debt-service";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

export const CreateDebtApiSchema = CreateDebtSchema.omit({
  ownerId: true,
  actor: true,
  source: true,
  nextPaymentDate: true
}).extend({
  nextPaymentDate: z.string().datetime().optional()
});

export async function GET() {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const debts = await prisma.debt.findMany({
    where: { ownerId: owner.id },
    include: {
      payments: {
        orderBy: { paymentDate: "asc" }
      }
    },
    orderBy: { partyName: "asc" }
  });

  return NextResponse.json(debts);
}

export async function POST(request: Request) {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const { nextPaymentDate, ...input } = CreateDebtApiSchema.parse(await request.json());
  const created = await createDebtWithOptionalPlan(prisma, {
    ...input,
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web",
    ...(nextPaymentDate ? { nextPaymentDate: new Date(nextPaymentDate) } : {})
  });

  return NextResponse.json(created, { status: 201 });
}
