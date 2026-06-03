import { describe, expect, it, vi } from "vitest";
import { ensureOwner } from "@/server/services/owner-service";

describe("ensureOwner", () => {
  it("creates an owner when none exists", async () => {
    const createdOwner = {
      id: "owner-1",
      telegramUserId: "tg-1",
      displayName: "Hrach",
      settings: {},
      createdAt: new Date("2026-06-03T00:00:00.000Z")
    };
    const db = {
      owner: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdOwner)
      }
    };

    const owner = await ensureOwner(db, {
      telegramUserId: "tg-1",
      displayName: "Hrach"
    });

    expect(db.owner.findUnique).toHaveBeenCalledWith({
      where: { telegramUserId: "tg-1" }
    });
    expect(db.owner.create).toHaveBeenCalledWith({
      data: { telegramUserId: "tg-1", displayName: "Hrach" }
    });
    expect(owner).toBe(createdOwner);
  });

  it("returns an existing owner without creating one", async () => {
    const existingOwner = {
      id: "owner-1",
      telegramUserId: "tg-1",
      displayName: "Hrach",
      settings: {},
      createdAt: new Date("2026-06-03T00:00:00.000Z")
    };
    const db = {
      owner: {
        findUnique: vi.fn().mockResolvedValue(existingOwner),
        create: vi.fn()
      }
    };

    const owner = await ensureOwner(db, {
      telegramUserId: "tg-1",
      displayName: "Updated"
    });

    expect(owner).toBe(existingOwner);
    expect(db.owner.create).not.toHaveBeenCalled();
  });
});

