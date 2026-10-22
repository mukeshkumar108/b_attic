import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/requireUser";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { voiceErrorResponse } from "@/lib/voice/errors";

/** The person's own gratitude cards, newest first. */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const rows = await prisma.voiceSessionReport.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, createdAt: true, card: true },
    });
    const items = rows
      .filter((r) => (r.card as { moment?: unknown } | null)?.moment)
      .map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), card: r.card }));
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof AuthError) return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    console.error("GET /api/bluum/voice/library error:", err);
    return voiceErrorResponse(500, "internal_error", "Internal server error", true);
  }
}
