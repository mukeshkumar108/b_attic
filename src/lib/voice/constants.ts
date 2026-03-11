import { env } from "@/env";

export const VOICE_SESSION_TTL_MINUTES = env.VOICE_SESSION_TTL_MINUTES ?? 20;
export const VOICE_AUDIO_URL_TTL_SECONDS =
  env.VOICE_TTS_AUDIO_URL_TTL_SECONDS ?? 600;
export const VOICE_MAX_AUDIO_BYTES = env.VOICE_MAX_AUDIO_BYTES ?? 2 * 1024 * 1024;
export const VOICE_MAX_AUDIO_MS = env.VOICE_MAX_AUDIO_MS ?? 20_000;

export const ACCEPTED_AUDIO_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
]);

export const DEFAULT_VOICE_LOCALE = "en-US";
