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
  const extension = getExtensionForMime(params.mimeType);

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(params.audio)], { type: params.mimeType });
  formData.append("file", blob, `turn-audio.${extension}`);
  formData.append("model", model);
  const normalizedLanguage = normalizeLanguage(params.locale);
  if (normalizedLanguage) {
    formData.append("language", normalizedLanguage);
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
    const errorText = await safeReadText(response);
    console.error("Lemonfox STT non-OK response:", {
      status: response.status,
      body: errorText?.slice(0, 500) ?? "",
    });

    if (response.status === 429) {
      throw new VoiceServiceError(
        "rate_limited",
        429,
        true,
        "Speech service is rate limited. Please try again."
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new VoiceServiceError(
        "stt_provider_error",
        503,
        false,
        "Speech provider authentication failed."
      );
    }

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

function getExtensionForMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return "bin";
  }
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function normalizeLanguage(locale?: string): string | null {
  if (!locale) {
    return null;
  }

  const trimmed = locale.trim();
  if (!trimmed) {
    return null;
  }

  // Lemonfox STT expects a language code like "en", not region locales like "en-US".
  const base = trimmed.split(/[-_]/)[0]?.toLowerCase();
  if (!base || !/^[a-z]{2,3}$/.test(base)) {
    return null;
  }

  return base;
}
