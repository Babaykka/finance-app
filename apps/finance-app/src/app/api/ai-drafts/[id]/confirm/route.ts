import { NextResponse } from "next/server";
import { SourceSchema } from "@/domain/enums";
import { AiParseResultSchema } from "@/server/ai/schema";
import type { ActionApplicationDb } from "@/server/services/action-application-service";

const CONFIRMABLE_DRAFT_STATUSES = ["pending", "needs_clarification"] as const;

class DraftCannotBeConfirmedError extends Error {}

const buildClarificationMessage = (needsClarification: string[]) => {
  const details = needsClarification.length > 0 ? `: ${needsClarification.join(" ")}` : ".";

  return `Этот черновик сначала нужно уточнить. Нажми «Исправить» и напиши недостающие данные${details}`;
};

const isDebtPaymentDisambiguationError = (error: unknown) =>
  error instanceof Error &&
  error.message.includes("record_debt_payment requires debtId");

const toDraftConfirmationErrorResponse = (error: unknown) => {
  if (error instanceof DraftCannotBeConfirmedError) {
    return NextResponse.json(
      { error: "Draft cannot be confirmed.", message: error.message },
      { status: 422 }
    );
  }

  if (isDebtPaymentDisambiguationError(error)) {
    return NextResponse.json(
      {
        error: "Draft cannot be confirmed.",
        message:
          "Этот платеж нужно уточнить перед сохранением. Нажми «Исправить» и укажи, к какому долгу относится оплата."
      },
      { status: 422 }
    );
  }

  return null;
};

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

  let result: { draftId: string; applied: number } | null;

  try {
    result = await prisma.$transaction(async (tx) => {
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
      if (parsed.needsClarification.length > 0 || parsed.actions.length === 0) {
        throw new DraftCannotBeConfirmedError(
          buildClarificationMessage(parsed.needsClarification)
        );
      }

      const applied = await applyAiActions(toActionApplicationDb(tx), {
        ownerId: owner.id,
        actor: `telegram:${owner.telegramUserId}`,
        source: SourceSchema.parse(draft.source),
        actions: parsed.actions
      });

      return { draftId: id, applied: applied.length };
    });
  } catch (error) {
    const response = toDraftConfirmationErrorResponse(error);
    if (response) {
      return response;
    }

    throw error;
  }

  if (!result) {
    return NextResponse.json(
      { error: "Draft was not found or is no longer confirmable." },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
