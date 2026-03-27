/**
 * POST /api/bluum/activity/log
 * Record a user's engagement with a lesson, breathing exercise, or game.
 * Called from both self-initiated and LLM-suggested activity completions.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

const logSchema = z.object({
  activityType: z.enum(["LESSON", "BREATHING", "GAME"] as const),
  activitySlug: z.string().min(1).max(100),
  source: z.enum(["SELF_INITIATED", "LLM_SUGGESTED"] as const),
  sessionId: z.string().optional().nullable(), // VoiceSession.id if LLM-suggested
  outcome: z.enum(["COMPLETED", "PARTIAL", "EXITED", "DECLINED"] as const),
  completedPct: z.number().min(0).max(1).optional().nullable(),
  durationSec: z.number().int().min(0).optional().nullable(),
  score: z.number().int().optional().nullable(),
  scoreData: z.record(z.string(), z.unknown()).optional().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = logSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const {
      activityType,
      activitySlug,
      source,
      sessionId,
      outcome,
      completedPct,
      durationSec,
      score,
      scoreData,
      startedAt,
      endedAt,
    } = parsed.data;

    // Verify sessionId belongs to this user if provided
    if (sessionId) {
      const session = await prisma.voiceSession.findFirst({
        where: { id: sessionId, userId: user.id },
        select: { id: true },
      });
      if (!session) {
        return errorResponse("Session not found", 404);
      }
    }

    const engagement = await prisma.activityEngagement.create({
      data: {
        userId: user.id,
        activityType,
        activitySlug,
        source,
        sessionId: sessionId ?? null,
        outcome,
        completedPct: completedPct ?? null,
        durationSec: durationSec ?? null,
        score: score ?? null,
        scoreData: scoreData
          ? (scoreData as Prisma.InputJsonValue)
          : undefined,
        startedAt: new Date(startedAt),
        endedAt: endedAt ? new Date(endedAt) : null,
      },
      select: { id: true },
    });

    return NextResponse.json({ saved: true, id: engagement.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/activity/log error:", err);
    return errorResponse("Internal server error", 500);
  }
}
