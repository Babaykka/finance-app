type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "arrayBuffer" | "json" | "ok" | "status">>;

export async function downloadTelegramVoiceFile(input: {
  fetcher: Fetcher;
  botToken: string;
  fileId: string;
}) {
  const fileResponse = await input.fetcher(
    `https://api.telegram.org/bot${input.botToken}/getFile?file_id=${encodeURIComponent(input.fileId)}`
  );

  if (!fileResponse.ok) {
    throw new Error(`Telegram getFile failed with HTTP ${fileResponse.status}`);
  }

  const fileJson = (await fileResponse.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = fileJson.result?.file_path;

  if (!fileJson.ok || !filePath) {
    throw new Error("Telegram getFile response did not include file_path");
  }

  const downloadResponse = await input.fetcher(
    `https://api.telegram.org/file/bot${input.botToken}/${filePath}`
  );

  if (!downloadResponse.ok) {
    throw new Error(`Telegram voice download failed with HTTP ${downloadResponse.status}`);
  }

  const bytes = await downloadResponse.arrayBuffer();
  return new File([bytes], "telegram-voice.ogg", { type: "audio/ogg" });
}
