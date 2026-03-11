import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/requireUser";
import { VoiceServiceError, voiceErrorResponse } from "@/lib/voice/errors";
import { processVoiceTurn } from "@/lib/voice/service";

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const formData = await request.formData();

    const sessionId = formData.get("sessionId");
    const clientTurnId = formData.get("clientTurnId");
    const audio = formData.get("audio");
    const locale = formData.get("locale");
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
    if (!(audio instanceof File)) {
      return voiceErrorResponse(400, "validation_error", "audio file is required.", false);
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    const result = await processVoiceTurn({
      user,
      sessionId: sessionId.trim(),
      clientTurnId: clientTurnId.trim(),
      audio: audioBuffer,
      mimeType: audio.type || "application/octet-stream",
      audioDurationMs,
      locale: typeof locale === "string" ? locale : null,
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
