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
});
