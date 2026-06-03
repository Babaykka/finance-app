import { NextResponse } from "next/server";
import { z } from "zod";
import { RecordPaymentSchema, recordDebtPayment } from "@/server/services/debt-service";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

const RecordDebtPaymentApiSchema = RecordPaymentSchema.omit({
  ownerId: true,
  actor: true,
  source: true,
  paymentDate: true
}).extend({
  paymentDate: z.string().datetime()
});

export async function POST(request: Request) {
  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const { paymentDate, ...input } = RecordDebtPaymentApiSchema.parse(await request.json());
  const created = await recordDebtPayment(prisma, {
    ...input,
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web",
    paymentDate: new Date(paymentDate)
  });

  return NextResponse.json(created, { status: 201 });
}
