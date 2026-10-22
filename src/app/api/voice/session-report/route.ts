import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { claimsFromBearer } from "@/lib/voice/connectToken";
import { asMemoryState, mergeMemory, REPORT_GRACE_SEC } from "@/lib/voice/memory";

const sensitivity = z.enum(["nominal", "sensitive"]);
const delta = z.object({
  people: z.array(z.object({ ref: z.string().optional(), name: z.string(), relation: z.string().optional(), meaning: z.string().optional(), sensitivity: sensitivity.optional(), basis: z.string().optional() })).optional(),
  themes: z.array(z.object({ label: z.string(), sensitivity: sensitivity.optional(), basis: z.string().optional() })).optional(),
  facts: z.array(z.object({ fact: z.string(), category: z.string().optional(), sensitivity: sensitivity.optional(), expiresInDays: z.number().optional(), basis: z.string().optional() })).optional(),
  threads: z.array(z.object({ ref: z.string().optional(), topic: z.string(), status: z.enum(["open", "followed_up", "resolved", "expired"]).optional(), notBeforeDays: z.number().optional(), expiresInDays: z.number().optional(), suggestedCheckin: z.string().optional(), sensitivity: sensitivity.optional(), basis: z.string().optional() })).optional(),
  style: z.object({ notes: z.array(z.string()).optional() }).optional(),
});

const body = z.object({
  conversationId: z.string().min(1),
  flow: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  card: z.record(z.string(), z.unknown()).nullable().optional(),
  profile: z.record(z.string(), z.unknown()).nullable().optional(),
  voiceFeatures: z.record(z.string(), z.unknown()).nullable().optional(),
  memoryDelta: delta.optional(),
  costUsd: z.number().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
  promptVersion: z.string().optional(),
  ruleVersion: z.string().optional(),
});

/**
 * Called once by the voice server when a Bloom call ends (bearer = the call's token). Stores the
 * analysis it produced (card, profile, voice numbers) and rolls the memory delta into UserMemory.
 * The transcript never comes here.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.VOICE_SESSION_SECRET?.trim();
  const claims = secret ? claimsFromBearer(request.headers.get("authorization"), secret, REPORT_GRACE_SEC) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = parsed.data;
  if (b.conversationId !== claims.cid) return NextResponse.json({ error: "conversation_mismatch" }, { status: 403 });

  const existingReport = await prisma.voiceSessionReport.findUnique({ where: { conversationId: claims.cid } });
  if (existingReport) return NextResponse.json({ ok: true, duplicate: true });

  const row = await prisma.userMemory.findUnique({ where: { userId: claims.uid } });
  const { memory, applied } = mergeMemory(asMemoryState(row as never), b.memoryDelta ?? {}, claims.cid);
  const json = (v: unknown) => (v ?? undefined) as never;
  const memoryData = { people: json(memory.people), themes: json(memory.themes), facts: json(memory.facts), openThreads: json(memory.openThreads), style: json(memory.style) };

  await prisma.$transaction([
    prisma.voiceSessionReport.create({
      data: {
        userId: claims.uid, conversationId: claims.cid, flow: b.flow ?? claims.flow, durationSeconds: b.durationSeconds,
        card: json(b.card), profile: json(b.profile), voiceFeatures: json(b.voiceFeatures), memoryUpdates: json(applied),
        costUsd: b.costUsd, models: json(b.models), promptVersion: b.promptVersion, ruleVersion: b.ruleVersion,
      },
    }),
    prisma.userMemory.upsert({ where: { userId: claims.uid }, create: { userId: claims.uid, ...memoryData }, update: memoryData }),
  ]);
  return NextResponse.json({ ok: true, applied: applied.length });
}
