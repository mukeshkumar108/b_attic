import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/requireVoiceUser", () => ({ requireVoiceUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { prisma } from "@/lib/prisma";
import { verifyVoiceToken } from "@/lib/voice/connectToken";
import { POST as connectRoute } from "@/app/api/bluum/voice/connect/route";
import { GET as contextRoute } from "@/app/api/voice/context/route";
import { POST as turnRoute } from "@/app/api/voice/turn/route";

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", body: JSON.stringify(body), headers }) as never;
}
function get(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "GET", headers }) as never;
}

describe("streaming voice routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VOICE_SESSION_SECRET = "test-secret";
    process.env.VOICE_PUBLIC_URL = "wss://voice.example/voice/v1/realtime";
    process.env.VOICE_HOST_PUBLIC_URL = "https://b-attic.example/";
    vi.mocked(requireVoiceUser).mockResolvedValue({
      user: { id: "user_1", timezone: "Europe/London", displayName: "Kai" } as never,
      clerkUserId: "clerk_1",
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", displayName: "Kai" } as never);
  });

  it("issues a token the voice server can verify, naming this host", async () => {
    const res = await connectRoute(post("http://x/api/bluum/voice/connect", { flow: "first_reflection_core", timezone: "Asia/Tokyo" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voiceUrl).toBe("wss://voice.example/voice/v1/realtime");
    const claims = verifyVoiceToken(body.token, "test-secret");
    expect(claims).toMatchObject({
      uid: "user_1",
      companion: "bloom",
      flow: "first_reflection_core",
      tz: "Asia/Tokyo",
      host: "https://b-attic.example",
    });
    expect(claims?.cid).toBeTruthy();
  });

  it("falls back to the stored timezone when the device one is invalid", async () => {
    const res = await connectRoute(post("http://x/api/bluum/voice/connect", { flow: "onboarding", timezone: "Not/AZone" }));
    expect(verifyVoiceToken((await res.json()).token, "test-secret")?.tz).toBe("Europe/London");
  });

  it("rejects unknown flows", async () => {
    const res = await connectRoute(post("http://x/api/bluum/voice/connect", { flow: "free_text" }));
    expect(res.status).toBe(400);
  });

  it("serves the unchanged flow prompt as application_context to the bearer", async () => {
    const connect = await connectRoute(post("http://x/api/bluum/voice/connect", { flow: "first_reflection_core" }));
    const { token } = await connect.json();

    expect((await contextRoute(get("http://x/api/voice/context"))).status).toBe(401);

    const ok = await contextRoute(get("http://x/api/voice/context", { authorization: `Bearer ${token}` }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.history).toEqual([]);
    expect(body.session_routing).toEqual({});
    expect(body.application_context.context_type).toBe("product-context-v1");
    expect(body.application_context.character_constitution).toContain("REFLECTION CORE PROMPT");
  });

  it("acknowledges completed turns only for a valid bearer", async () => {
    const connect = await connectRoute(post("http://x/api/bluum/voice/connect", { flow: "onboarding" }));
    const { token } = await connect.json();
    expect((await turnRoute(post("http://x/api/voice/turn", {}))).status).toBe(401);
    expect((await turnRoute(post("http://x/api/voice/turn", { turn_id: "t" }, { authorization: `Bearer ${token}` }))).status).toBe(200);
  });
});
