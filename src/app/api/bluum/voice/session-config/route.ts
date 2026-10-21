import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { voiceErrorResponse } from "@/lib/voice/errors";
import { verifyVoiceToken } from "@/lib/voice/connectToken";
import { loadFlowConstitution } from "@/lib/voice/connectPrompt";

const bodySchema = z.object({ token: z.string().min(10) });

function serviceKeyMatches(request: NextRequest, expected: string): boolean {
  const provided = request.headers.get("x-voice-service-key")?.trim() ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Server to server: the voice service exchanges a verified connect token for the
 * authorised session configuration. Never called by the phone.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.VOICE_SESSION_SECRET?.trim();
  const serviceKey = process.env.VOICE_SERVICE_KEY?.trim();
  if (!secret || !serviceKey) {
    return voiceErrorResponse(503, "voice_not_configured", "Streaming voice is not configured", true);
  }
  if (!serviceKeyMatches(request, serviceKey)) {
    return voiceErrorResponse(401, "unauthorized", "Unauthorized", false);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return voiceErrorResponse(400, "validation_error", "token is required", false);
  }
  const claims = verifyVoiceToken(parsed.data.token, secret);
  if (!claims) {
    return voiceErrorResponse(401, "invalid_token", "Invalid or expired token", false);
  }

  const user = await prisma.user.findUnique({ where: { id: claims.uid } });
  if (!user) {
    return voiceErrorResponse(404, "user_not_found", "User not found", false);
  }

  return NextResponse.json({
    sessionId: claims.sid,
    userId: claims.uid,
    companionId: claims.pid,
    flow: claims.flow,
    timezone: claims.tz,
    constitution: loadFlowConstitution(claims.flow, {
      displayName: (user as { displayName?: string | null }).displayName,
    }),
  });
}
