import { describe, expect, it, vi } from "vitest";
import { transcribeAudioFile } from "@/server/ai/transcription";

describe("transcribeAudioFile", () => {
  it("returns trimmed transcription text from the OpenAI client", async () => {
    const create = vi.fn().mockResolvedValue({ text: "  Контрагент Эпсилон вернул 10000 рублей  " });
    const file = new File(["voice"], "voice.ogg", { type: "audio/ogg" });

    const text = await transcribeAudioFile(
      { audio: { transcriptions: { create } } },
      { file, model: "gpt-4o-mini-transcribe", language: "ru" }
    );

    expect(create).toHaveBeenCalledWith({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "ru"
    });
    expect(text).toBe("Контрагент Эпсилон вернул 10000 рублей");
  });

  it("throws when the transcription text is missing", async () => {
    const create = vi.fn().mockResolvedValue({ text: "   " });
    const file = new File(["voice"], "voice.ogg", { type: "audio/ogg" });

    await expect(
      transcribeAudioFile(
        { audio: { transcriptions: { create } } },
        { file, model: "gpt-4o-mini-transcribe" }
      )
    ).rejects.toThrow("Transcription text is required");
  });
});
