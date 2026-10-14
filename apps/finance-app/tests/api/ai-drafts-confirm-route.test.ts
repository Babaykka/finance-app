import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.fn();
const findFirst = vi.fn();
const findFirstOrThrow = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const getLocalOwner = vi.fn();
const applyAiActions = vi.fn();

const tx = {
  aiDraft: {
    findFirst,
    findFirstOrThrow,
    updateMany,
    update
  },
  storagePlace: { create: vi.fn() },
  debt: { create: vi.fn(), findFirstOrThrow: vi.fn(), update: vi.fn() },
  debtPayment: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn()
};

vi.mock("@/server/db", () => ({
  prisma: {
    $transaction: transaction
  }
}));

vi.mock("@/server/auth/local-owner", () => ({
  getLocalOwner
}));

vi.mock("@/server/services/action-application-service", () => ({
  applyAiActions
}));

describe("ai-drafts confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation((callback) => callback(tx));
    getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
  });

  it("applies parsed actions and marks the owner-scoped draft confirmed", async () => {
    const parsedActions = {
      confidence: 0.92,
      summary: "Создать место хранения.",
      actions: [
        {
          type: "create_storage_place",
          name: "Альфабанк резервный",
          storageType: "trusted_person",
          subtype: "not_applicable",
          holderContext: "Другой владелец",
          asset: "RUB",
          amount: 804000,
          amountKind: "exact",
          availability: "restricted",
          attentionPriority: "high"
        }
      ],
      needsClarification: []
    };

    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue({
      id: "draft-1",
      ownerId: "owner-1",
      source: "telegram_text",
      parsedActions
    });
    applyAiActions.mockResolvedValue([{ id: "storage-1" }]);
    update.mockResolvedValue({ id: "draft-1", status: "confirmed" });

    const { POST } = await import("@/app/api/ai-drafts/[id]/confirm/route");
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "draft-1" })
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "draft-1",
        ownerId: "owner-1",
        status: { in: ["pending", "needs_clarification"] }
      },
      data: { status: "confirmed", confirmedAt: expect.any(Date) }
    });
    expect(findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "draft-1", ownerId: "owner-1" }
    });
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      applyAiActions.mock.invocationCallOrder[0]
    );
    const [actionDb, actionInput] = applyAiActions.mock.calls[0];
    expect(actionDb).toEqual({
      storagePlace: tx.storagePlace,
      debt: tx.debt,
      debtPayment: tx.debtPayment,
      auditLog: tx.auditLog
    });
    expect(actionDb).not.toHaveProperty("$transaction");
    expect(actionInput).toEqual({
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: parsedActions.actions
    });
    expect(update).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ draftId: "draft-1", applied: 1 });
  });

  it("returns 404 when the draft is missing or no longer confirmable", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const { POST } = await import("@/app/api/ai-drafts/[id]/confirm/route");
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "draft-2" })
    });

    expect(response.status).toBe(404);
    expect(findFirstOrThrow).not.toHaveBeenCalled();
    expect(applyAiActions).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 422 when the draft still needs clarification", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue({
      id: "draft-clarify",
      ownerId: "owner-1",
      source: "telegram_text",
      parsedActions: {
        confidence: 0.61,
        summary: "Записать оплату долга.",
        actions: [],
        needsClarification: ["Уточнить, к какому долгу относится оплата."]
      }
    });

    const { POST } = await import("@/app/api/ai-drafts/[id]/confirm/route");
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "draft-clarify" })
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Draft cannot be confirmed.",
      message:
        "Этот черновик сначала нужно уточнить. Нажми «Исправить» и напиши недостающие данные: Уточнить, к какому долгу относится оплата."
    });
    expect(applyAiActions).not.toHaveBeenCalled();
  });

  it("returns 422 when a debt payment draft is not disambiguated", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue({
      id: "draft-payment",
      ownerId: "owner-1",
      source: "telegram_text",
      parsedActions: {
        confidence: 0.85,
        summary: "Записать оплату долга.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Другой владелец",
            amount: 18000,
            asset: "RUB",
            paymentDate: "2026-06-07"
          }
        ],
        needsClarification: []
      }
    });
    applyAiActions.mockRejectedValue(
      new Error("record_debt_payment requires debtId; disambiguate the debt before confirmation")
    );

    const { POST } = await import("@/app/api/ai-drafts/[id]/confirm/route");
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "draft-payment" })
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Draft cannot be confirmed.",
      message:
        "Этот платеж нужно уточнить перед сохранением. Нажми «Исправить» и укажи, к какому долгу относится оплата."
    });
    expect(applyAiActions).toHaveBeenCalledOnce();
  });

  it("leaves the claim rolled back when action application fails", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue({
      id: "draft-3",
      ownerId: "owner-1",
      source: "telegram_text",
      parsedActions: {
        confidence: 0.92,
        summary: "Создать место хранения.",
        actions: [
          {
            type: "create_storage_place",
            name: "Альфабанк резервный",
            storageType: "trusted_person",
            subtype: "not_applicable",
            holderContext: "Другой владелец",
            asset: "RUB",
            amount: 804000,
            amountKind: "exact",
            availability: "restricted",
            attentionPriority: "high"
          }
        ],
        needsClarification: []
      }
    });
    applyAiActions.mockRejectedValue(new Error("apply failed"));

    const { POST } = await import("@/app/api/ai-drafts/[id]/confirm/route");
    await expect(
      POST(new Request("http://localhost"), {
        params: Promise.resolve({ id: "draft-3" })
      })
    ).rejects.toThrow("apply failed");

    expect(updateMany).toHaveBeenCalledOnce();
    expect(applyAiActions).toHaveBeenCalledOnce();
  });
});
