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

  it("cleans awkward cash storage names when applying existing drafts", async () => {
    const db = {
      storagePlace: {
        create: vi.fn().mockResolvedValue({ id: "storage-1", name: "Наличные" })
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
          type: "create_storage_place",
          name: "Нал Cash",
          storageType: "cash",
          subtype: "not_applicable",
          holderContext: "Нал Cash",
          asset: "RUB",
          amount: 90000,
          amountKind: "exact",
          availability: "immediate",
          attentionPriority: "medium"
        }
      ]
    });

    expect(db.storagePlace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Наличные",
        holderContext: "Наличные",
        type: "cash"
      })
    });
  });

  it("applies storage place rename updates with audit", async () => {
    const db = {
      storagePlace: {
        create: vi.fn(),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "storage-cash",
          ownerId: "owner-1",
          name: "Нал cash",
          type: "cash",
          subtype: "not_applicable",
          holderContext: "Нал cash",
          asset: "RUB",
          amount: 90000,
          amountKind: "exact",
          availability: "immediate",
          rate: null,
          interestRule: null,
          interestPaymentDay: null,
          reviewOrEndDate: null,
          lastCheckedAt: null,
          status: "active",
          attentionPriority: "medium",
          comment: null
        }),
        update: vi.fn().mockResolvedValue({
          id: "storage-cash",
          name: "Наличные в кошельке"
        })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-rename" })
      }
    };

    const results = await applyAiActions(db, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: [
        {
          type: "update_storage_place",
          currentName: "Нал cash",
          name: "Наличные в кошельке"
        } as never
      ]
    });

    expect(results).toEqual([{ id: "storage-cash", name: "Наличные в кошельке" }]);
    expect(db.storagePlace.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        name: "Нал cash"
      }
    });
    expect(db.storagePlace.update).toHaveBeenCalledWith({
      where: { id: "storage-cash" },
      data: {
        name: "Наличные в кошельке"
      }
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "owner-1",
        actor: "telegram:123",
        source: "telegram_text",
        entityType: "StoragePlace",
        entityId: "storage-cash",
        oldValues: expect.objectContaining({
          name: "Нал cash"
        }),
        newValues: {
          name: "Наличные в кошельке"
        }
      })
    });
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
