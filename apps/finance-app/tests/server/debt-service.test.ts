import { describe, expect, it, vi } from "vitest";
import { createDebtWithOptionalPlan, recordDebtPayment } from "@/server/services/debt-service";

describe("debt service", () => {
  it("creates work receivable with a planned payment", async () => {
    const tx = {
      debt: {
        create: vi.fn().mockResolvedValue({ id: "debt-1", partyName: "Степан Гаврилюк" }),
        findFirstOrThrow: vi.fn(),
        update: vi.fn()
      },
      debtPayment: {
        create: vi.fn().mockResolvedValue({ id: "payment-1" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (callback) => callback(tx))
    };

    await createDebtWithOptionalPlan(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      partyName: "Степан Гаврилюк",
      type: "work_receivable",
      basis: "дипломная работа",
      asset: "RUB",
      originalAmount: 25000,
      status: "scheduled",
      nextPaymentAmount: 25000,
      nextPaymentDate: new Date("2026-06-03T00:00:00.000Z"),
      attentionPriority: "urgent",
      comment: "Клиент. До 3 июня 2026."
    });

    expect(db.debt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "owner-1",
        partyName: "Степан Гаврилюк",
        originalAmount: 25000,
        remainingAmount: 25000
      })
    });
    expect(db.debtPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordType: "planned",
        status: "expected"
      })
    });
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.auditLog.create).toHaveBeenCalledTimes(2);
    expect(db.auditLog.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        entityType: "DebtPayment",
        entityId: "payment-1",
        newValues: expect.objectContaining({
          recordType: "planned",
          paymentDate: "2026-06-03T00:00:00.000Z",
          status: "expected"
        })
      })
    });
    expect(db.auditLog.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        entityType: "Debt",
        entityId: "debt-1",
        newValues: expect.objectContaining({
          nextPaymentDate: "2026-06-03T00:00:00.000Z",
          remainingAmount: 25000
        })
      })
    });
  });

  it("records actual payment and reduces remaining amount", async () => {
    const tx = {
      debt: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "debt-2",
          ownerId: "owner-1",
          remainingAmount: 50000,
          asset: "RUB",
          status: "scheduled"
        }),
        update: vi.fn().mockResolvedValue({ id: "debt-2", remainingAmount: 40000 })
      },
      debtPayment: {
        create: vi.fn().mockResolvedValue({ id: "payment-2" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" })
      }
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (callback) => callback(tx))
    };

    const payment = await recordDebtPayment(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      debtId: "debt-2",
      paymentDate: new Date("2026-06-03T00:00:00.000Z"),
      amount: 10000,
      asset: "RUB",
      comment: "Геворг вернул часть."
    });

    expect(payment.id).toBe("payment-2");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.debtPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordType: "actual",
        status: "received",
        amount: 10000
      })
    });
    const updateCall = db.debt.update.mock.calls[0]?.[0];
    expect(updateCall.where).toEqual({ id: "debt-2" });
    expect(updateCall.data.remainingAmount.toString()).toBe("40000");
    expect(updateCall.data).not.toHaveProperty("status");
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "DebtPayment",
        entityId: "payment-2",
        oldValues: { debtRemainingAmount: "50000", debtStatus: "scheduled" },
        newValues: expect.objectContaining({
          debtId: "debt-2",
          paymentDate: "2026-06-03T00:00:00.000Z",
          asset: "RUB",
          status: "received",
          debtRemainingAmount: "40000",
          debtStatus: "scheduled"
        })
      })
    });
  });

  it("closes the debt when an actual payment reaches zero remaining amount", async () => {
    const tx = {
      debt: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "debt-4",
          ownerId: "owner-1",
          remainingAmount: 10000,
          asset: "RUB",
          status: "scheduled"
        }),
        update: vi.fn().mockResolvedValue({ id: "debt-4", remainingAmount: 0, status: "closed" })
      },
      debtPayment: {
        create: vi.fn().mockResolvedValue({ id: "payment-4" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-4" })
      }
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (callback) => callback(tx))
    };

    await recordDebtPayment(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      debtId: "debt-4",
      paymentDate: new Date("2026-06-03T00:00:00.000Z"),
      amount: 10000,
      asset: "RUB"
    });

    const updateCall = db.debt.update.mock.calls[0]?.[0];
    expect(updateCall.data.remainingAmount.toString()).toBe("0");
    expect(updateCall.data.status).toBe("closed");
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValues: { debtRemainingAmount: "10000", debtStatus: "scheduled" },
        newValues: expect.objectContaining({
          debtRemainingAmount: "0",
          debtStatus: "closed"
        })
      })
    });
  });

  it("rejects actual payments in a different asset", async () => {
    const tx = {
      debt: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "debt-3",
          ownerId: "owner-1",
          remainingAmount: 50000,
          asset: "RUB",
          status: "scheduled"
        }),
        update: vi.fn()
      },
      debtPayment: {
        create: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      }
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (callback) => callback(tx))
    };

    await expect(
      recordDebtPayment(db as never, {
        ownerId: "owner-1",
        actor: "telegram:123",
        source: "telegram_text",
        debtId: "debt-3",
        paymentDate: new Date("2026-06-03T00:00:00.000Z"),
        amount: 100,
        asset: "USDT"
      })
    ).rejects.toThrow("Payment asset USDT does not match debt asset RUB");

    expect(db.debtPayment.create).not.toHaveBeenCalled();
    expect(db.debt.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects overpayments before creating a payment", async () => {
    const tx = {
      debt: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "debt-5",
          ownerId: "owner-1",
          remainingAmount: 5000,
          asset: "RUB",
          status: "scheduled"
        }),
        update: vi.fn()
      },
      debtPayment: {
        create: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      }
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (callback) => callback(tx))
    };

    await expect(
      recordDebtPayment(db as never, {
        ownerId: "owner-1",
        actor: "telegram:123",
        source: "telegram_text",
        debtId: "debt-5",
        paymentDate: new Date("2026-06-03T00:00:00.000Z"),
        amount: 10000,
        asset: "RUB"
      })
    ).rejects.toThrow("Payment amount exceeds debt remaining amount");

    expect(db.debtPayment.create).not.toHaveBeenCalled();
    expect(db.debt.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
