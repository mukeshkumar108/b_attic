import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/requireVoiceUser", () => ({ requireVoiceUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import { prisma } from "@/lib/prisma";
import { verifyVoiceToken } from "@/lib/voice/connectToken";
import { POST as connectRoute } from "@/app/api/bluum/voice/connect/route";
import { POST as configRoute } from "@/app/api/bluum/voice/session-config/route";

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", body: JSON.stringify(body), headers }) as never;
}

describe("voice connect + session-config routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VOICE_SESSION_SECRET = "test-secret";
    process.env.VOICE_SERVICE_KEY = "svc-key";
    process.env.VOICE_PUBLIC_URL = "wss://voice.example/v1/realtime";
    vi.mocked(requireVoiceUser).mockResolvedValue({
      user: { id: "user_1", timezone: "Europe/London", displayName: "Kai" } as never,
      clerkUserId: "clerk_1",
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", displayName: "Kai" } as never);
  });

  it("issues a token for the authenticated user and flow", async () => {
    const res = await connectRoute(req("http://x/api/bluum/voice/connect", { flow: "first_reflection_core", timezone: "Asia/Tokyo" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voiceUrl).toBe("wss://voice.example/v1/realtime");
    const claims = verifyVoiceToken(body.token, "test-secret");
    expect(claims).toMatchObject({ uid: "user_1", pid: "bloom", flow: "first_reflection_core", tz: "Asia/Tokyo" });
  });

  it("falls back to the stored timezone when the device one is invalid", async () => {
    const res = await connectRoute(req("http://x/api/bluum/voice/connect", { flow: "onboarding", timezone: "Not/AZone" }));
    const claims = verifyVoiceToken((await res.json()).token, "test-secret");
    expect(claims?.tz).toBe("Europe/London");
  });

  it("rejects unknown flows", async () => {
    const res = await connectRoute(req("http://x/api/bluum/voice/connect", { flow: "free_text" }));
    expect(res.status).toBe(400);
  });

  it("exchanges a token for the flow prompt with the service key only", async () => {
    const connect = await connectRoute(req("http://x/api/bluum/voice/connect", { flow: "first_reflection_core" }));
    const { token } = await connect.json();

    const denied = await configRoute(req("http://x/api/bluum/voice/session-config", { token }));
    expect(denied.status).toBe(401);

    const ok = await configRoute(req("http://x/api/bluum/voice/session-config", { token }, { "x-voice-service-key": "svc-key" }));
    expect(ok.status).toBe(200);
    const cfg = await ok.json();
    expect(cfg).toMatchObject({ userId: "user_1", companionId: "bloom", flow: "first_reflection_core" });
    expect(cfg.constitution).toContain("REFLECTION CORE PROMPT");
  });

  it("rejects a bad token", async () => {
    const res = await configRoute(req("http://x/api/bluum/voice/session-config", { token: "abcdefghijk.bad" }, { "x-voice-service-key": "svc-key" }));
    expect(res.status).toBe(401);
  });
});
