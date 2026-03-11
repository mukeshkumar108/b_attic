import { env } from "@/env";
import { VoiceServiceError } from "@/lib/voice/errors";

const DEFAULT_LEMONFOX_API_URL = "https://api.lemonfox.ai/v1/audio/transcriptions";

export interface STTResult {
  text: string;
  latencyMs: number;
}

export async function transcribeWithLemonfox(params: {
  audio: Buffer;
  mimeType: string;
  locale?: string;
}): Promise<STTResult> {
  const apiKey = env.LEMONFOX_API_KEY;
  if (!apiKey) {
    throw new VoiceServiceError(
      "stt_provider_error",
      503,
      true,
      "Lemonfox STT is not configured"
    );
  }

  const start = Date.now();
  const url = env.LEMONFOX_API_URL ?? DEFAULT_LEMONFOX_API_URL;
  const model = env.LEMONFOX_STT_MODEL ?? "whisper-1";

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(params.audio)], { type: params.mimeType });
  formData.append("file", blob, "turn-audio");
  formData.append("model", model);
  if (params.locale) {
    formData.append("language", params.locale);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
  } catch {
    throw new VoiceServiceError(
      "stt_provider_error",
      503,
      true,
      "Speech service temporarily unavailable."
    );
  }

  if (!response.ok) {
    throw new VoiceServiceError(
      "stt_provider_error",
      503,
      true,
      "Speech service temporarily unavailable."
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new VoiceServiceError(
      "stt_provider_error",
      503,
      true,
      "Speech service returned an invalid response."
    );
  }

  const text =
    typeof (data as { text?: unknown }).text === "string"
      ? (data as { text: string }).text.trim()
      : "";

  if (!text) {
    throw new VoiceServiceError(
      "stt_unintelligible",
      422,
      true,
      "Could not understand speech. Please try again."
    );
  }

  return {
    text,
    latencyMs: Date.now() - start,
  };
}
