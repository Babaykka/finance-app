type OpenAiTranscriptionRequest = {
  file: File;
  model: string;
  language?: string;
};

type OpenAiTranscriptionResponse = {
  text?: string | null;
};

export type OpenAiTranscriptionClient = {
  audio: {
    transcriptions: {
      create(input: OpenAiTranscriptionRequest): PromiseLike<OpenAiTranscriptionResponse>;
    };
  };
};

export type TranscribeAudioFileInput = OpenAiTranscriptionRequest;

export async function transcribeAudioFile(
  client: OpenAiTranscriptionClient,
  input: TranscribeAudioFileInput
) {
  const request: OpenAiTranscriptionRequest = {
    file: input.file,
    model: input.model,
    ...(input.language ? { language: input.language } : {})
  };
  const response = await client.audio.transcriptions.create(request);
  const text = response.text?.trim();

  if (!text) {
    throw new Error("Transcription text is required");
  }

  return text;
}
