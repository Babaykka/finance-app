import { describe, expect, it, vi } from "vitest";
import { downloadTelegramVoiceFile } from "@/server/telegram/voice";

describe("downloadTelegramVoiceFile", () => {
  it("resolves Telegram file path and returns a File", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: true, result: { file_path: "voice/file.ogg" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4))
      });

    const file = await downloadTelegramVoiceFile({ fetcher, botToken: "token", fileId: "file-id" });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://api.telegram.org/bottoken/getFile?file_id=file-id"
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/file/bottoken/voice/file.ogg"
    );
    expect(file.name).toBe("telegram-voice.ogg");
    expect(file.type).toBe("audio/ogg");
  });

  it("throws when Telegram getFile is not ok", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    await expect(
      downloadTelegramVoiceFile({ fetcher, botToken: "token", fileId: "missing-file" })
    ).rejects.toThrow("Telegram getFile failed with HTTP 404");
  });

  it("throws when Telegram getFile omits file_path", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, result: {} })
    });

    await expect(
      downloadTelegramVoiceFile({ fetcher, botToken: "token", fileId: "missing-path" })
    ).rejects.toThrow("Telegram getFile response did not include file_path");
  });
});
