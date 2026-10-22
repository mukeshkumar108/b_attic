import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/requireUser";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { voiceErrorResponse } from "@/lib/voice/errors";
import { asMemoryState, expireThreads } from "@/lib/voice/memory";

/** The person's own session reports and memory, for the research view. No transcripts exist here to return. */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const [reports, memoryRow] = await Promise.all([
      prisma.voiceSessionReport.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.userMemory.findUnique({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        flow: r.flow,
        durationSeconds: r.durationSeconds,
        card: r.card,
        profile: r.profile,
        voiceFeatures: r.voiceFeatures,
        memoryUpdates: r.memoryUpdates,
        costUsd: r.costUsd,
        models: r.models,
        promptVersion: r.promptVersion,
        ruleVersion: r.ruleVersion,
      })),
      memory: expireThreads(asMemoryState(memoryRow as never), new Date()),
    });
  } catch (err) {
    if (err instanceof AuthError) return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    console.error("GET /api/bluum/voice/research error:", err);
    return voiceErrorResponse(500, "internal_error", "Internal server error", true);
  }
}
