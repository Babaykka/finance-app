import { describe, expect, it, vi } from "vitest";
import { applyAiActions } from "@/server/services/action-application-service";

describe("applyAiActions", () => {
  it("applies create_storage_place through the audited storage service", async () => {
    const db = {
      storagePlace: {
        create: vi.fn().mockResolvedValue({ id: "storage-1", name: "Альфабанк Вероники" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    const results = await applyAiActions(db, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: [
        {
          type: "create_storage_place",
          name: "Альфабанк Вероники",
          storageType: "trusted_person",
          subtype: "not_applicable",
          holderContext: "Вероника",
          asset: "RUB",
          amount: 804000,
          amountKind: "exact",
          availability: "restricted",
          attentionPriority: "high",
          comment: "Мои деньги на Альфабанк Вероники."
        }
      ]
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: "storage-1", name: "Альфабанк Вероники" });
    expect(db.storagePlace.create).toHaveBeenCalledOnce();
    expect(db.storagePlace.create).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        name: "Альфабанк Вероники",
        type: "trusted_person",
        subtype: "not_applicable",
        holderContext: "Вероника",
        asset: "RUB",
        amount: 804000,
        amountKind: "exact",
        availability: "restricted",
        status: "check",
        attentionPriority: "high",
        comment: "Мои деньги на Альфабанк Вероники."
      }
    });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });

  it("opens a batch transaction when the db supports it", async () => {
    const tx = {
      storagePlace: {
        create: vi.fn().mockResolvedValue({ id: "storage-1", name: "Альфабанк Вероники" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };
    const db = {
      ...tx,
      $transaction: vi.fn((callback) => callback(tx))
    };

    await applyAiActions(db, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: [
        {
          type: "create_storage_place",
          name: "Альфабанк Вероники",
          storageType: "trusted_person",
          subtype: "not_applicable",
          holderContext: "Вероника",
          asset: "RUB",
          amount: 804000,
          amountKind: "exact",
          availability: "restricted",
          attentionPriority: "high"
        }
      ]
    });

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.storagePlace.create).toHaveBeenCalledOnce();
  });

  it("maps create_debt due dates to planned payments", async () => {
    const db = {
      debt: {
        create: vi.fn().mockResolvedValue({ id: "debt-1", partyName: "Геворг" }),
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

    await applyAiActions(db, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: [
        {
          type: "create_debt",
          partyName: "Геворг",
          debtType: "personal_debt",
          basis: "личный долг другу",
          asset: "RUB",
          amount: 50000,
          status: "scheduled",
          dueDate: "2026-06-30",
          attentionPriority: "medium"
        }
      ]
    });

    expect(db.debtPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordType: "planned",
        amount: 50000,
        paymentDate: new Date("2026-06-30T00:00:00.000Z")
      })
    });
  });

  it("maps record_debt_payment dates to actual payments", async () => {
    const db = {
      debt: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "debt-1",
          ownerId: "owner-1",
          remainingAmount: 50000,
          asset: "RUB",
          status: "scheduled"
        }),
        update: vi.fn().mockResolvedValue({ id: "debt-1" })
      },
      debtPayment: {
        create: vi.fn().mockResolvedValue({ id: "payment-1" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    await applyAiActions(db, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: [
        {
          type: "record_debt_payment",
          debtId: "debt-1",
          amount: 10000,
          asset: "RUB",
          paymentDate: "2026-06-03"
        }
      ]
    });

    expect(db.debtPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordType: "actual",
        paymentDate: new Date("2026-06-03T00:00:00.000Z")
      })
    });
  });

  it("requires debtId before applying record_debt_payment", async () => {
    const db = {
      debt: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn(),
        update: vi.fn()
      },
      debtPayment: {
        create: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      }
    };

    await expect(
      applyAiActions(db, {
        ownerId: "owner-1",
        actor: "telegram:123",
        source: "telegram_text",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Геворг",
            amount: 10000,
            asset: "RUB",
            paymentDate: "2026-06-03"
          }
        ]
      })
    ).rejects.toThrow(
      "record_debt_payment requires debtId; disambiguate the debt before confirmation"
    );

    expect(db.debtPayment.create).not.toHaveBeenCalled();
  });
});
