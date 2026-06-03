import { describe, expect, it, vi } from "vitest";
import { createStoragePlace } from "@/server/services/storage-service";

describe("createStoragePlace", () => {
  it("creates Альфабанк Вероники as trusted-person RUB storage with audit", async () => {
    const db = {
      storagePlace: {
        create: vi.fn().mockResolvedValue({ id: "storage-1", name: "Альфабанк Вероники" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    const result = await createStoragePlace(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
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
    });

    expect(result.id).toBe("storage-1");
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
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "StoragePlace",
        entityId: "storage-1",
        newValues: expect.not.objectContaining({
          actor: expect.anything(),
          source: expect.anything()
        })
      })
    });
  });
});
