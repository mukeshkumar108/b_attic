import { put } from "@vercel/blob";
import { env } from "@/env";
import { VOICE_AUDIO_URL_TTL_SECONDS } from "@/lib/voice/constants";

const DEFAULT_ELEVENLABS_API_URL = "https://api.elevenlabs.io";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";

export interface TTSResult {
  audioUrl: string | null;
  audioMimeType: string | null;
  audioExpiresAt: string | null;
  ttsAvailable: boolean;
  latencyMs: number;
}

export async function synthesizeWithElevenlabs(params: {
  text: string;
  voiceId?: string | null;
  blobPath: string;
}): Promise<TTSResult> {
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = params.voiceId ?? env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return {
      audioUrl: null,
      audioMimeType: null,
      audioExpiresAt: null,
      ttsAvailable: false,
      latencyMs: 0,
    };
  }

  const startedAt = Date.now();
  const baseUrl = env.ELEVENLABS_API_URL ?? DEFAULT_ELEVENLABS_API_URL;
  const modelId = env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: modelId,
      }),
    });
  } catch {
    return {
      audioUrl: null,
      audioMimeType: null,
      audioExpiresAt: null,
      ttsAvailable: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  if (!response.ok) {
    return {
      audioUrl: null,
      audioMimeType: null,
      audioExpiresAt: null,
      ttsAvailable: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  const audioBytes = await response.arrayBuffer();
  if (!audioBytes.byteLength) {
    return {
      audioUrl: null,
      audioMimeType: null,
      audioExpiresAt: null,
      ttsAvailable: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  try {
    const blob = await put(params.blobPath, audioBytes, {
      access: "public",
      addRandomSuffix: true,
      contentType: "audio/mpeg",
    });

    return {
      audioUrl: blob.url,
      audioMimeType: "audio/mpeg",
      audioExpiresAt: new Date(
        Date.now() + VOICE_AUDIO_URL_TTL_SECONDS * 1000
      ).toISOString(),
      ttsAvailable: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      audioUrl: null,
      audioMimeType: null,
      audioExpiresAt: null,
      ttsAvailable: false,
      latencyMs: Date.now() - startedAt,
    };
  }
}
