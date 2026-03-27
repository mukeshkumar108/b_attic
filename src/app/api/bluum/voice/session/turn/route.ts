import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/requireUser";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { VoiceServiceError, voiceErrorResponse } from "@/lib/voice/errors";
import { processVoiceTurn } from "@/lib/voice/service";

function parseResponseMode(
  value: FormDataEntryValue | null
): "final" | "staged" | "finalize" {
  if (typeof value !== "string" || !value.trim()) {
    return "final";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "final" ||
    normalized === "staged" ||
    normalized === "finalize"
  ) {
    return normalized;
  }

  throw new VoiceServiceError(
    "validation_error",
    400,
    false,
    "responseMode must be one of: final, staged, finalize."
  );
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function parseOptionalClientEvent(
  value: FormDataEntryValue | null
):
  | {
      type: "activity_result";
      actionId: string;
      activityType: "BREATHING" | "LESSON" | "GAME";
      activitySlug: string;
      outcome: "COMPLETED" | "PARTIAL" | "EXITED" | "DECLINED";
      durationSec?: number | null;
      completedPct?: number | null;
      score?: number | null;
      scoreData?: Record<string, unknown> | null;
    }
  | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new VoiceServiceError(
      "validation_error",
      400,
      false,
      "clientEvent must be valid JSON."
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const formData = await request.formData();

    const sessionId = formData.get("sessionId");
    const clientTurnId = formData.get("clientTurnId");
    const audio = formData.get("audio");
    const textInput = parseOptionalString(formData.get("textInput"));
    const choiceValue = parseOptionalString(formData.get("choiceValue"));
    const clientEvent = parseOptionalClientEvent(formData.get("clientEvent"));
    const locale = formData.get("locale");
    const responseMode = parseResponseMode(formData.get("responseMode"));
    const audioDurationMs = parseOptionalInt(formData.get("audioDurationMs"));
    const hasAudio = audio instanceof File;
    const providedCount =
      Number(hasAudio) +
      Number(Boolean(textInput)) +
      Number(Boolean(choiceValue)) +
      Number(Boolean(clientEvent));

    if (typeof sessionId !== "string" || !sessionId.trim()) {
      return voiceErrorResponse(
        400,
        "validation_error",
        "sessionId is required.",
        false
      );
    }
    if (typeof clientTurnId !== "string" || !clientTurnId.trim()) {
      return voiceErrorResponse(
        400,
        "validation_error",
        "clientTurnId is required.",
        false
      );
    }
    if (responseMode === "finalize") {
      if (providedCount > 0) {
        return voiceErrorResponse(
          400,
          "validation_error",
          "Finalize mode does not accept audio, textInput, or choiceValue.",
          false
        );
      }
    } else if (responseMode === "staged") {
      if (!hasAudio) {
        return voiceErrorResponse(
          400,
          "unsupported_response_mode",
          "Staged mode requires audio input.",
          false
        );
      }
      if (providedCount !== 1) {
        return voiceErrorResponse(
          400,
          "turn_input_conflict",
          "Provide exactly one of audio, textInput, or choiceValue.",
          false
        );
      }
    } else if (providedCount === 0) {
      return voiceErrorResponse(
        400,
        "turn_input_required",
        "Provide exactly one of audio, textInput, or choiceValue.",
        false
      );
    } else if (providedCount > 1) {
      return voiceErrorResponse(
        400,
        "turn_input_conflict",
        "Provide exactly one of audio, textInput, or choiceValue.",
        false
      );
    }

    const audioBuffer =
      hasAudio ? Buffer.from(await audio.arrayBuffer()) : null;
    const result = await processVoiceTurn({
      user,
      sessionId: sessionId.trim(),
      clientTurnId: clientTurnId.trim(),
      audio: audioBuffer,
      mimeType: hasAudio ? audio.type || "application/octet-stream" : null,
      textInput,
      choiceValue,
      clientEvent,
      audioDurationMs,
      locale: typeof locale === "string" ? locale : null,
      responseMode,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof AuthError) {
      return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    }
    if (err instanceof VoiceServiceError) {
      return voiceErrorResponse(err.status, err.code, err.message, err.retryable);
    }
    console.error("POST /api/bluum/voice/session/turn error:", err);
    return voiceErrorResponse(
      500,
      "internal_error",
      "Internal server error",
      true
    );
  }
}
