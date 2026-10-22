import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimsFromBearer } from "@/lib/voice/connectToken";
import { isModularFlow, loadFlowConstitution } from "@/lib/voice/connectPrompt";
import { buildDirective, SESSION_GUARDRAILS } from "@/lib/voice/directive";
import { asMemoryState, expireThreads } from "@/lib/voice/memory";

/**
 * Called by the voice server when a call connects (bearer = the connect token). Returns the
 * session's product context: the unchanged flow prompt as the Runtime's application_context.
 * Bluum has no chat history to join yet, so history and routing state start empty.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.VOICE_SESSION_SECRET?.trim();
  const claims = secret ? claimsFromBearer(request.headers.get("authorization"), secret) : null;
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: claims.uid } });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const constitution = loadFlowConstitution(claims.flow, {
    displayName: (user as { displayName?: string | null }).displayName,
  });
  const directive = await personalise(claims.uid, claims.cid, claims.tz, claims.flow, {
    name: (user as { displayName?: string | null }).displayName,
    pronouns: (user as { pronouns?: string | null }).pronouns,
  });

  return NextResponse.json({
    history: [],
    session_routing: {},
    application_context: {
      context_type: "product-context-v1",
      character_constitution: [constitution, isModularFlow(claims.flow) ? null : SESSION_GUARDRAILS, directive].filter(Boolean).join("\n\n"),
    },
  });
}

/**
 * What we know about this person, as a short block for the prompt. A thread that is surfaced here is marked
 * followed_up so it is only offered once. Never blocks the call: any failure just means no personalisation.
 */
async function personalise(
  userId: string,
  conversationId: string,
  timezone: string,
  flow: string,
  person: { name?: string | null; pronouns?: string | null }
): Promise<string | null> {
  try {
    const row = await prisma.userMemory.findUnique({ where: { userId } });
    const now = new Date();
    const memory = expireThreads(asMemoryState(row as never), now);
    const reports = await prisma.voiceSessionReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true, profile: true, voiceFeatures: true },
    });
    const directive = buildDirective(
      memory,
      reports.map((r) => ({ createdAt: r.createdAt, profile: r.profile as never, voiceFeatures: r.voiceFeatures as never })),
      now,
      timezone,
      flow,
      person
    );
    if (!directive) return null;
    if (!row) return directive.text;
    const surfaced = new Set(directive.surfacedThreadIds);
    const next = {
      ...memory,
      openThreads: memory.openThreads.map((t) => (surfaced.has(t.id) ? { ...t, status: "followed_up" as const } : t)),
      style: { ...memory.style, lastDirective: { conversationId, ruleVersion: directive.ruleVersion, applied: directive.applied, at: now.toISOString() } },
    };
    await prisma.userMemory.update({ where: { userId }, data: { openThreads: next.openThreads as never, style: next.style as never } });
    return directive.text;
  } catch (err) {
    console.error("voice context personalisation failed:", err);
    return null;
  }
}
