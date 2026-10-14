import { describe, expect, it, vi } from "vitest";
import { ensureOwner } from "@/server/services/owner-service";

describe("ensureOwner", () => {
  it("upserts the configured owner", async () => {
    const createdOwner = {
      id: "owner-1",
      telegramUserId: "tg-1",
      displayName: "Owner",
      settings: {},
      createdAt: new Date("2026-06-03T00:00:00.000Z")
    };
    const db = {
      owner: {
        upsert: vi.fn().mockResolvedValue(createdOwner)
      }
    };

    const owner = await ensureOwner(db, {
      telegramUserId: "tg-1",
      displayName: "Owner"
    });

    expect(db.owner.upsert).toHaveBeenCalledWith({
      where: { telegramUserId: "tg-1" },
      update: {},
      create: { telegramUserId: "tg-1", displayName: "Owner" }
    });
    expect(owner).toBe(createdOwner);
  });

  it("does not overwrite an existing owner display name", async () => {
    const existingOwner = {
      id: "owner-1",
      telegramUserId: "tg-1",
      displayName: "Owner",
      settings: {},
      createdAt: new Date("2026-06-03T00:00:00.000Z")
    };
    const db = {
      owner: {
        upsert: vi.fn().mockResolvedValue(existingOwner)
      }
    };

    const owner = await ensureOwner(db, {
      telegramUserId: "tg-1",
      displayName: "Updated"
    });

    expect(owner).toBe(existingOwner);
    expect(db.owner.upsert).toHaveBeenCalledWith({
      where: { telegramUserId: "tg-1" },
      update: {},
      create: { telegramUserId: "tg-1", displayName: "Updated" }
    });
  });
});
