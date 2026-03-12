import { NextResponse } from "next/server";

export type VoiceErrorCode =
  | "unauthorized"
  | "validation_error"
  | "unsupported_media_type"
  | "audio_too_large"
  | "audio_too_long"
  | "stt_unintelligible"
  | "stt_provider_error"
  | "llm_provider_error"
  | "tts_provider_error"
  | "turn_not_found"
  | "turn_finalize_in_progress"
  | "turn_pending_finalize"
  | "turn_input_required"
  | "turn_input_conflict"
  | "unsupported_response_mode"
  | "invalid_choice_value"
  | "session_not_found"
  | "session_expired"
  | "session_inactive"
  | "idempotency_conflict"
  | "reflection_exists"
  | "onboarding_incomplete"
  | "reflection_empty"
  | "reflection_too_long"
  | "rate_limited"
  | "internal_error";

export function voiceErrorResponse(
  status: number,
  code: VoiceErrorCode,
  message: string,
  retryable: boolean
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        retryable,
      },
    },
    { status }
  );
}

export class VoiceServiceError extends Error {
  constructor(
    public code: VoiceErrorCode,
    public status: number,
    public retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = "VoiceServiceError";
  }
}
