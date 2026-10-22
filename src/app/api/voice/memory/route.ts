import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimsFromBearer } from "@/lib/voice/connectToken";
import { asMemoryState, expireThreads, REPORT_GRACE_SEC } from "@/lib/voice/memory";

/** What we already know about the caller, for the end-of-session analysis (bearer = the call's token). */
export async function GET(request: NextRequest) {
  const secret = process.env.VOICE_SESSION_SECRET?.trim();
  const claims = secret ? claimsFromBearer(request.headers.get("authorization"), secret, REPORT_GRACE_SEC) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await prisma.userMemory.findUnique({ where: { userId: claims.uid } });
  const memory = expireThreads(asMemoryState(row as never), new Date());
  return NextResponse.json({ memory });
}
