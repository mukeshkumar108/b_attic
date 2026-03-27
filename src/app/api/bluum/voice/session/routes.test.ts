import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/requireUser";
import { VoiceServiceError } from "@/lib/voice/errors";

vi.mock("@/lib/auth/requireVoiceUser", () => ({
  requireVoiceUser: vi.fn(),
}));

vi.mock("@/lib/voice/service", () => ({
  startVoiceSession: vi.fn(),
  processVoiceTurn: vi.fn(),
  endVoiceSession: vi.fn(),
}));

import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";
import {
  endVoiceSession,
  processVoiceTurn,
  startVoiceSession,
} from "@/lib/voice/service";
import { POST as startRoute } from "@/app/api/bluum/voice/session/start/route";
import { POST as turnRoute } from "@/app/api/bluum/voice/session/turn/route";
import { POST as endRoute } from "@/app/api/bluum/voice/session/end/route";

describe("voice session API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireVoiceUser).mockResolvedValue({
      user: { id: "user_1" } as any,
      clerkUserId: "clerk_1",
    });
  });

  it("POST /start returns service payload", async () => {
    vi.mocked(startVoiceSession).mockResolvedValue({
      status: 201,
      body: { session: { id: "vsn_1" } },
    });

    const request = new Request("http://localhost/api/bluum/voice/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: "onboarding",
        clientSessionId: "c1",
      }),
    });

    const response = await startRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.session.id).toBe("vsn_1");
    expect(startVoiceSession).toHaveBeenCalled();
  });

  it("POST /start forwards reflectionTrack when provided", async () => {
    vi.mocked(startVoiceSession).mockResolvedValue({
      status: 201,
      body: { session: { id: "vsn_1" } },
    });

    const request = new Request("http://localhost/api/bluum/voice/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: "first_reflection",
        reflectionTrack: "core",
        clientSessionId: "c2",
      }),
    });

    const response = await startRoute(request as any);
    expect(response.status).toBe(201);
    expect(startVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "first_reflection",
        reflectionTrack: "core",
        clientSessionId: "c2",
      })
    );
  });

  it("POST /start forwards voice_demo flow", async () => {
    vi.mocked(startVoiceSession).mockResolvedValue({
      status: 201,
      body: { session: { id: "vsn_demo" } },
    });

    const request = new Request("http://localhost/api/bluum/voice/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: "voice_demo",
        clientSessionId: "demo_1",
      }),
    });

    const response = await startRoute(request as any);
    expect(response.status).toBe(201);
    expect(startVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "voice_demo",
        clientSessionId: "demo_1",
      })
    );
  });

  it("POST /start forwards practiceMode when provided", async () => {
    vi.mocked(startVoiceSession).mockResolvedValue({
      status: 201,
      body: { session: { id: "vsn_1" } },
    });

    const request = new Request("http://localhost/api/bluum/voice/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: "first_reflection",
        reflectionTrack: "day0",
        practiceMode: true,
        clientSessionId: "c3",
      }),
    });

    const response = await startRoute(request as any);
    expect(response.status).toBe(201);
    expect(startVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "first_reflection",
        reflectionTrack: "day0",
        practiceMode: true,
        clientSessionId: "c3",
      })
    );
  });

  it("POST /start validates request body", async () => {
    const request = new Request("http://localhost/api/bluum/voice/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: "bad_flow",
        clientSessionId: "c1",
      }),
    });

    const response = await startRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("validation_error");
  });

  it("POST /start maps auth errors", async () => {
    vi.mocked(requireVoiceUser).mockRejectedValue(
      new AuthError("Unauthorized", 401)
    );
    const request = new Request("http://localhost/api/bluum/voice/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: "onboarding",
        clientSessionId: "c1",
      }),
    });

    const response = await startRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("unauthorized");
  });

  it("POST /turn requires one input source", async () => {
    const formData = new FormData();
    formData.set("sessionId", "vsn_1");
    formData.set("clientTurnId", "turn_1");

    const request = new Request("http://localhost/api/bluum/voice/session/turn", {
      method: "POST",
      body: formData,
    });

    const response = await turnRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("turn_input_required");
    expect(processVoiceTurn).not.toHaveBeenCalled();
  });

  it("POST /turn rejects mixed input sources", async () => {
    const formData = new FormData();
    formData.set("sessionId", "vsn_1");
    formData.set("clientTurnId", "turn_mix");
    formData.set("textInput", "hello");
    formData.set(
      "audio",
      new File([Buffer.from("test-audio")], "test-audio.m4a", {
        type: "audio/x-m4a",
      })
    );

    const request = new Request("http://localhost/api/bluum/voice/session/turn", {
      method: "POST",
      body: formData,
    });

    const response = await turnRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("turn_input_conflict");
    expect(processVoiceTurn).not.toHaveBeenCalled();
  });

  it("POST /turn forwards multipart payload to service", async () => {
    vi.mocked(processVoiceTurn).mockResolvedValue({
      status: 200,
      body: { session: { id: "vsn_1" }, turn: { id: "vturn_1" } },
    });

    const formData = new FormData();
    formData.set("sessionId", "vsn_1");
    formData.set("clientTurnId", "turn_1");
    formData.set("locale", "en-US");
    formData.set(
      "audio",
      new File([Buffer.from("test-audio")], "test-audio.m4a", {
        type: "audio/x-m4a",
      })
    );

    const request = new Request("http://localhost/api/bluum/voice/session/turn", {
      method: "POST",
      body: formData,
    });

    const response = await turnRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.turn.id).toBe("vturn_1");
    expect(processVoiceTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "vsn_1",
        clientTurnId: "turn_1",
        mimeType: "audio/x-m4a",
        locale: "en-US",
        textInput: null,
        choiceValue: null,
      })
    );
  });

  it("POST /turn forwards clientEvent payload to service", async () => {
    vi.mocked(processVoiceTurn).mockResolvedValue({
      status: 200,
      body: { session: { id: "vsn_1" }, turn: { id: "vturn_evt_1" } },
    });

    const formData = new FormData();
    formData.set("sessionId", "vsn_1");
    formData.set("clientTurnId", "turn_evt_1");
    formData.set(
      "clientEvent",
      JSON.stringify({
        type: "activity_result",
        actionId: "act_1",
        activityType: "BREATHING",
        activitySlug: "breathing-4-7-8",
        outcome: "COMPLETED",
        durationSec: 58,
        completedPct: 1,
      })
    );

    const request = new Request("http://localhost/api/bluum/voice/session/turn", {
      method: "POST",
      body: formData,
    });

    const response = await turnRoute(request as any);
    expect(response.status).toBe(200);
    expect(processVoiceTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "vsn_1",
        clientTurnId: "turn_evt_1",
        clientEvent: expect.objectContaining({
          type: "activity_result",
          actionId: "act_1",
          activityType: "BREATHING",
        }),
      })
    );
  });

  it("POST /turn forwards textInput payload to service", async () => {
    vi.mocked(processVoiceTurn).mockResolvedValue({
      status: 200,
      body: { session: { id: "vsn_1" }, turn: { id: "vturn_2" } },
    });

    const formData = new FormData();
    formData.set("sessionId", "vsn_1");
    formData.set("clientTurnId", "turn_text");
    formData.set("textInput", "I have tried gratitude before.");

    const request = new Request("http://localhost/api/bluum/voice/session/turn", {
      method: "POST",
      body: formData,
    });

    const response = await turnRoute(request as any);
    expect(response.status).toBe(200);
    expect(processVoiceTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "vsn_1",
        clientTurnId: "turn_text",
        audio: null,
        mimeType: null,
        textInput: "I have tried gratitude before.",
        choiceValue: null,
      })
    );
  });

  it("POST /turn supports finalize mode without audio", async () => {
    vi.mocked(processVoiceTurn).mockResolvedValue({
      status: 200,
      body: { session: { id: "vsn_1" }, turn: { id: "vturn_1" } },
    });

    const formData = new FormData();
    formData.set("sessionId", "vsn_1");
    formData.set("clientTurnId", "turn_1");
    formData.set("responseMode", "finalize");

    const request = new Request("http://localhost/api/bluum/voice/session/turn", {
      method: "POST",
      body: formData,
    });

    const response = await turnRoute(request as any);
    expect(response.status).toBe(200);
    expect(processVoiceTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "vsn_1",
        clientTurnId: "turn_1",
        responseMode: "finalize",
        audio: null,
        mimeType: null,
        textInput: null,
        choiceValue: null,
      })
    );
  });

  it("POST /end maps voice service errors", async () => {
    vi.mocked(endVoiceSession).mockRejectedValue(
      new VoiceServiceError(
        "session_not_found",
        404,
        false,
        "Session not found."
      )
    );

    const request = new Request("http://localhost/api/bluum/voice/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "vsn_1",
        clientEndId: "end_1",
      }),
    });

    const response = await endRoute(request as any);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("session_not_found");
    expect(payload.error.retryable).toBe(false);
  });
});
