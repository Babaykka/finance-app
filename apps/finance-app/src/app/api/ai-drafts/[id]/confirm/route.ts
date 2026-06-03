import { NextResponse } from "next/server";
import { SourceSchema } from "@/domain/enums";
import { AiParseResultSchema } from "@/server/ai/schema";
import type { ActionApplicationDb } from "@/server/services/action-application-service";

const CONFIRMABLE_DRAFT_STATUSES = ["pending", "needs_clarification"] as const;

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }, { applyAiActions }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner"),
    import("@/server/services/action-application-service")
  ]);

  return { prisma, getLocalOwner, applyAiActions };
};

type ActionApplicationTransactionDb = {
  storagePlace: NonNullable<ActionApplicationDb["storagePlace"]>;
  debt: NonNullable<ActionApplicationDb["debt"]>;
  debtPayment: NonNullable<ActionApplicationDb["debtPayment"]>;
  auditLog: NonNullable<ActionApplicationDb["auditLog"]>;
};

const toActionApplicationDb = (tx: ActionApplicationTransactionDb): ActionApplicationDb => ({
  storagePlace: tx.storagePlace,
  debt: tx.debt,
  debtPayment: tx.debtPayment,
  auditLog: tx.auditLog
});

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { prisma, getLocalOwner, applyAiActions } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const { id } = await context.params;

  const result = await prisma.$transaction(async (tx) => {
    const confirmedAt = new Date();
    const claim = await tx.aiDraft.updateMany({
      where: {
        id,
        ownerId: owner.id,
        status: { in: [...CONFIRMABLE_DRAFT_STATUSES] }
      },
      data: {
        status: "confirmed",
        confirmedAt
      }
    });

    if (claim.count === 0) {
      return null;
    }

    const draft = await tx.aiDraft.findFirstOrThrow({
      where: { id, ownerId: owner.id }
    });

    const parsed = AiParseResultSchema.parse(draft.parsedActions);
    const applied = await applyAiActions(toActionApplicationDb(tx), {
      ownerId: owner.id,
      actor: `telegram:${owner.telegramUserId}`,
      source: SourceSchema.parse(draft.source),
      actions: parsed.actions
    });

    return { draftId: id, applied: applied.length };
  });

  if (!result) {
    return NextResponse.json(
      { error: "Draft was not found or is no longer confirmable." },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
