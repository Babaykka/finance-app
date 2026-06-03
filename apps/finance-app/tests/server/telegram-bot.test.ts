import { describe, expect, it, vi } from "vitest";
import { handleTelegramTextMessage } from "@/server/telegram/bot";

describe("handleTelegramTextMessage", () => {
  it("creates a draft and returns confirmation text with callback buttons", async () => {
    const createDraftFromText = vi.fn().mockResolvedValue({
      id: "draft-1",
      parsedActions: {
        summary: "Создать долг Геворга на 50 000 RUB."
      }
    });

    const response = await handleTelegramTextMessage({
      text: "Геворг должен 50000",
      telegramUserId: "123",
      createDraftFromText
    });

    expect(createDraftFromText).toHaveBeenCalledWith("Геворг должен 50000", "123");
    expect(response.text).toContain("Черновик");
    expect(response.text).toContain("Создать долг Геворга");
    expect(response.buttons).toEqual([
      { text: "Сохранить", callbackData: "draft:draft-1:confirm" },
      { text: "Исправить", callbackData: "draft:draft-1:edit" },
      { text: "Отмена", callbackData: "draft:draft-1:reject" }
    ]);
  });
});
