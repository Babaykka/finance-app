import { describe, expect, it, vi } from "vitest";
import { writeAuditLog } from "@/server/services/audit-service";

describe("writeAuditLog", () => {
  it("persists audit log values", async () => {
    const auditLog = {
      id: "audit-1",
      ownerId: "owner-1",
      actor: "owner",
      source: "telegram_text",
      entityType: "debt",
      entityId: "debt-1",
      oldValues: { remainingAmount: "1000" },
      newValues: { remainingAmount: "700" },
      aiDraftId: "draft-1",
      createdAt: new Date("2026-06-03T00:00:00.000Z")
    };
    const db = {
      auditLog: {
        create: vi.fn().mockResolvedValue(auditLog)
      }
    };

    const result = await writeAuditLog(db, {
      ownerId: "owner-1",
      actor: "owner",
      source: "telegram_text",
      entityType: "debt",
      entityId: "debt-1",
      oldValues: { remainingAmount: "1000" },
      newValues: { remainingAmount: "700" },
      aiDraftId: "draft-1"
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        ownerId: "owner-1",
        actor: "owner",
        source: "telegram_text",
        entityType: "debt",
        entityId: "debt-1",
        oldValues: { remainingAmount: "1000" },
        newValues: { remainingAmount: "700" },
        aiDraftId: "draft-1"
      }
    });
    expect(result).toBe(auditLog);
  });

  it("rejects invalid source values", async () => {
    const db = {
      auditLog: {
        create: vi.fn()
      }
    };

    await expect(
      writeAuditLog(db, {
        ownerId: "owner-1",
        actor: "owner",
        source: "voice-note",
        entityType: "debt",
        entityId: "debt-1"
      })
    ).rejects.toThrow();

    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
