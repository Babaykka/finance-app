import { describe, expect, it, vi } from "vitest";
import {
  extractAssistantMemoryCandidates,
  rememberAssistantExchange
} from "@/server/services/assistant-memory-service";

describe("assistant-memory-service", () => {
  it("extracts explicit durable preferences from remember-style messages", () => {
    expect(
      extractAssistantMemoryCandidates("запомни: наличку называй Наличные, а не Нал Cash")
    ).toEqual([
      {
        kind: "preference",
        text: "наличку называй Наличные, а не Нал Cash"
      }
    ]);
  });

  it("records both sides of a successful assistant exchange and upserts memories", async () => {
    const db = {
      assistantMessage: {
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      assistantMemory: {
        upsert: vi.fn().mockResolvedValue({ id: "memory-1" })
      }
    };

    await rememberAssistantExchange(db as never, {
      ownerId: "owner-1",
      source: "telegram_text",
      userText: "запомни: наличку называй Наличные",
      assistantText: "Запомнил."
    });

    expect(db.assistantMessage.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerId: "owner-1",
          role: "user",
          source: "telegram_text",
          text: "запомни: наличку называй Наличные"
        },
        {
          ownerId: "owner-1",
          role: "assistant",
          source: "telegram_text",
          text: "Запомнил."
        }
      ]
    });
    expect(db.assistantMemory.upsert).toHaveBeenCalledWith({
      where: {
        ownerId_kind_text: {
          ownerId: "owner-1",
          kind: "preference",
          text: "наличку называй Наличные"
        }
      },
      create: {
        ownerId: "owner-1",
        kind: "preference",
        text: "наличку называй Наличные",
        source: "telegram_text",
        status: "active"
      },
      update: {
        source: "telegram_text",
        status: "active"
      }
    });
  });
});
