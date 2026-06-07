import { describe, expect, it, vi } from "vitest";
import {
  clearTelegramConversationState,
  getTelegramConversationState,
  setTelegramConversationState
} from "@/server/services/telegram-conversation-state-service";

describe("telegram-conversation-state-service", () => {
  it("upserts a short-lived state by Telegram user id", async () => {
    const db = {
      telegramConversationState: {
        upsert: vi.fn().mockResolvedValue({ id: "state-1" })
      }
    };

    await setTelegramConversationState(db as never, {
      telegramUserId: "123",
      kind: "awaiting_storage_rename_name",
      payload: { currentName: "Нал cash" },
      now: new Date("2026-06-07T00:00:00.000Z")
    });

    expect(db.telegramConversationState.upsert).toHaveBeenCalledWith({
      where: { telegramUserId: "123" },
      create: {
        telegramUserId: "123",
        kind: "awaiting_storage_rename_name",
        payload: { currentName: "Нал cash" },
        expiresAt: new Date("2026-06-07T00:15:00.000Z")
      },
      update: {
        kind: "awaiting_storage_rename_name",
        payload: { currentName: "Нал cash" },
        expiresAt: new Date("2026-06-07T00:15:00.000Z")
      }
    });
  });

  it("returns active state payloads and clears expired states", async () => {
    const db = {
      telegramConversationState: {
        findUnique: vi.fn().mockResolvedValueOnce({
          telegramUserId: "123",
          kind: "awaiting_draft_correction",
          payload: { draftId: "draft-1" },
          expiresAt: new Date("2026-06-07T00:15:00.000Z")
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    await expect(
      getTelegramConversationState(db as never, {
        telegramUserId: "123",
        now: new Date("2026-06-07T00:10:00.000Z")
      })
    ).resolves.toEqual({
      kind: "awaiting_draft_correction",
      payload: { draftId: "draft-1" }
    });
    expect(db.telegramConversationState.deleteMany).not.toHaveBeenCalled();

    db.telegramConversationState.findUnique.mockResolvedValueOnce({
      telegramUserId: "123",
      kind: "awaiting_draft_correction",
      payload: { draftId: "draft-1" },
      expiresAt: new Date("2026-06-07T00:05:00.000Z")
    });

    await expect(
      getTelegramConversationState(db as never, {
        telegramUserId: "123",
        now: new Date("2026-06-07T00:10:00.000Z")
      })
    ).resolves.toBeNull();
    expect(db.telegramConversationState.deleteMany).toHaveBeenCalledWith({
      where: {
        telegramUserId: "123"
      }
    });
  });

  it("clears state by Telegram user id", async () => {
    const db = {
      telegramConversationState: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    await clearTelegramConversationState(db as never, "123");

    expect(db.telegramConversationState.deleteMany).toHaveBeenCalledWith({
      where: { telegramUserId: "123" }
    });
  });
});
