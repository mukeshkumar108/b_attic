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

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const formData = await request.formData();

    const sessionId = formData.get("sessionId");
    const clientTurnId = formData.get("clientTurnId");
    const audio = formData.get("audio");
    const locale = formData.get("locale");
    const responseMode = parseResponseMode(formData.get("responseMode"));
    const audioDurationMs = parseOptionalInt(formData.get("audioDurationMs"));

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
    if (responseMode !== "finalize" && !(audio instanceof File)) {
      return voiceErrorResponse(
        400,
        "validation_error",
        "audio file is required.",
        false
      );
    }

    const audioBuffer =
      audio instanceof File ? Buffer.from(await audio.arrayBuffer()) : null;
    const result = await processVoiceTurn({
      user,
      sessionId: sessionId.trim(),
      clientTurnId: clientTurnId.trim(),
      audio: audioBuffer,
      mimeType:
        audio instanceof File ? audio.type || "application/octet-stream" : null,
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
