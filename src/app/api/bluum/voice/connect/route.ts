import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/requireUser";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { voiceErrorResponse } from "@/lib/voice/errors";
import {
  signVoiceToken,
  VOICE_CONNECT_FLOWS,
  VOICE_TOKEN_TTL_SEC,
} from "@/lib/voice/connectToken";

const connectSchema = z.object({
  flow: z.enum(VOICE_CONNECT_FLOWS),
  timezone: z.string().min(1).max(64).optional().nullable(),
});

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const parsed = connectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return voiceErrorResponse(400, "validation_error", parsed.error.issues[0].message, false);
    }

    const secret = process.env.VOICE_SESSION_SECRET?.trim();
    const voiceUrl = process.env.VOICE_PUBLIC_URL?.trim();
    const hostUrl = process.env.VOICE_HOST_PUBLIC_URL?.trim().replace(/\/$/, "");
    if (!secret || !voiceUrl || !hostUrl) {
      return voiceErrorResponse(503, "voice_not_configured", "Streaming voice is not configured", true);
    }

    const requested = parsed.data.timezone;
    const timezone =
      requested && isValidTimezone(requested)
        ? requested
        : (user as { timezone?: string | null }).timezone || "UTC";

    const now = Math.floor(Date.now() / 1000);
    const token = signVoiceToken(
      {
        uid: user.id,
        cid: randomUUID(),
        tz: timezone,
        companion: "bloom",
        flow: parsed.data.flow,
        host: hostUrl,
        iat: now,
        exp: now + VOICE_TOKEN_TTL_SEC,
      },
      secret
    );

    return NextResponse.json({ voiceUrl, token });
  } catch (err) {
    if (err instanceof AuthError) {
      return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    }
    console.error("POST /api/bluum/voice/connect error:", err);
    return voiceErrorResponse(500, "internal_error", "Internal server error", true);
  }
}
