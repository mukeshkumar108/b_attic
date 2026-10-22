import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/requireUser";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { voiceErrorResponse } from "@/lib/voice/errors";
import { asMemoryState } from "@/lib/voice/memory";

const schema = z.object({
  id: z.string().min(1).max(120),
  correct: z.boolean().nullable(),
  reportId: z.string().optional(),
});

/** A reviewer marks one extracted memory item right or wrong (or clears the mark). */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireVoiceUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return voiceErrorResponse(400, "validation_error", parsed.error.issues[0].message, false);
    const { id, correct, reportId } = parsed.data;

    const row = await prisma.userMemory.findUnique({ where: { userId: user.id } });
    const memory = asMemoryState(row as never);
    let found = false;
    for (const list of [memory.people, memory.themes, memory.facts, memory.openThreads] as { id: string; correct: boolean | null }[][]) {
      for (const item of list) if (item.id === id) { item.correct = correct; found = true; }
    }
    if (found) {
      await prisma.userMemory.update({
        where: { userId: user.id },
        data: { people: memory.people as never, themes: memory.themes as never, facts: memory.facts as never, openThreads: memory.openThreads as never },
      });
    }

    if (reportId) {
      const report = await prisma.voiceSessionReport.findFirst({ where: { id: reportId, userId: user.id } });
      if (report && Array.isArray(report.memoryUpdates)) {
        const updates = (report.memoryUpdates as { id?: string; correct?: boolean | null }[]).map((u) => (u.id === id ? { ...u, correct } : u));
        await prisma.voiceSessionReport.update({ where: { id: report.id }, data: { memoryUpdates: updates as never } });
        found = true;
      }
    }
    return NextResponse.json({ ok: found });
  } catch (err) {
    if (err instanceof AuthError) return voiceErrorResponse(err.statusCode, "unauthorized", err.message, false);
    console.error("POST /api/bluum/voice/rate error:", err);
    return voiceErrorResponse(500, "internal_error", "Internal server error", true);
  }
}
