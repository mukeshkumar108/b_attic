import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimsFromBearer } from "@/lib/voice/connectToken";
import { loadFlowConstitution } from "@/lib/voice/connectPrompt";

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

  return NextResponse.json({
    history: [],
    session_routing: {},
    application_context: {
      context_type: "product-context-v1",
      character_constitution: loadFlowConstitution(claims.flow, {
        displayName: (user as { displayName?: string | null }).displayName,
      }),
    },
  });
}
