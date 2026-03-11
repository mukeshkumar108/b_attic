import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/requireUser";
import { VoiceServiceError, voiceErrorResponse } from "@/lib/voice/errors";
import { endVoiceSession } from "@/lib/voice/service";

const endSchema = z.object({
  sessionId: z.string().min(1),
  clientEndId: z.string().min(1),
  reason: z.string().optional().nullable(),
  commit: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await request.json();
    const parsed = endSchema.safeParse(body);
    if (!parsed.success) {
      return voiceErrorResponse(
        400,
        "validation_error",
        parsed.error.issues[0].message,
        false
      );
    }

    const result = await endVoiceSession({
      user,
      sessionId: parsed.data.sessionId,
      clientEndId: parsed.data.clientEndId,
      reason: parsed.data.reason,
      commit: parsed.data.commit,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof AuthError) {
      return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    }
    if (err instanceof VoiceServiceError) {
      return voiceErrorResponse(err.status, err.code, err.message, err.retryable);
    }
    console.error("POST /api/bluum/voice/session/end error:", err);
    return voiceErrorResponse(
      500,
      "internal_error",
      "Internal server error",
      true
    );
  }
}
