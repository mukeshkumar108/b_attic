import { NextRequest, NextResponse } from "next/server";
import { claimsFromBearer } from "@/lib/voice/connectToken";

/**
 * Called best-effort by the voice server after each completed spoken turn. Bluum does not
 * persist spoken turns yet (saving a reflection at session end is a known, accepted gap), so
 * this only authenticates and acknowledges.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.VOICE_SESSION_SECRET?.trim();
  const claims = secret ? claimsFromBearer(request.headers.get("authorization"), secret) : null;
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
