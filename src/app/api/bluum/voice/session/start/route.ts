import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/requireUser";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { VoiceServiceError, voiceErrorResponse } from "@/lib/voice/errors";
import { startVoiceSession } from "@/lib/voice/service";

const startSchema = z.object({
  flow: z.enum(["onboarding", "first_reflection"]),
  reflectionTrack: z.enum(["day0", "core"]).optional().nullable(),
  practiceMode: z.boolean().optional().nullable(),
  clientSessionId: z.string().min(1),
  dateLocal: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  ttsVoiceId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const body = await request.json();
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return voiceErrorResponse(
        400,
        "validation_error",
        parsed.error.issues[0].message,
        false
      );
    }

    const result = await startVoiceSession({
      user,
      flow: parsed.data.flow,
      reflectionTrack: parsed.data.reflectionTrack,
      practiceMode: parsed.data.practiceMode,
      clientSessionId: parsed.data.clientSessionId,
      dateLocal: parsed.data.dateLocal,
      locale: parsed.data.locale,
      ttsVoiceId: parsed.data.ttsVoiceId,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof AuthError) {
      return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    }
    if (err instanceof VoiceServiceError) {
      return voiceErrorResponse(err.status, err.code, err.message, err.retryable);
    }
    console.error("POST /api/bluum/voice/session/start error:", err);
    return voiceErrorResponse(
      500,
      "internal_error",
      "Internal server error",
      true
    );
  }
}
