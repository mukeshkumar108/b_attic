import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/requireUser", () => {
  class MockAuthError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = "AuthError";
      this.statusCode = statusCode;
    }
  }

  return {
    requireUser: vi.fn(),
    AuthError: MockAuthError,
    errorResponse: (message: string, status = 400) =>
      Response.json({ error: message }, { status }),
  };
});

vi.mock("@vercel/blob", () => ({
  list: vi.fn(),
}));

import { list } from "@vercel/blob";
import {
  AuthError,
  requireUser,
} from "@/lib/auth/requireUser";
import { GET } from "@/app/api/bluum/lessons/route";

describe("GET /api/bluum/lessons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "user_1" } as any,
      clerkUserId: "clerk_1",
    });
  });

  it("returns lesson list with sidecar metadata and fallback fields", async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [
        {
          pathname: "voice/lessons/bluum_lesson_negativity-bias_v1.mp3",
          url: "https://example.com/negativity-bias.mp3",
          uploadedAt: new Date("2026-03-12T10:00:00.000Z"),
        },
        {
          pathname: "voice/lessons/bluum_lesson_manual-save_v1.mp3",
          url: "https://example.com/manual-save.mp3",
          uploadedAt: new Date("2026-03-12T09:00:00.000Z"),
        },
        {
          pathname: "voice/lessons/bluum_lesson_manual-save_v1.json",
          url: "https://example.com/manual-save.json",
          uploadedAt: new Date("2026-03-12T09:00:01.000Z"),
        },
      ],
      hasMore: false,
      cursor: undefined,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "lesson_001_manual_save",
            slug: "manual-save",
            title: "Why everything feels like it's piling up",
            description: "Intro to Manual Save",
            order: 1,
            durationSec: 127,
            tags: ["negativity", "mood"],
            version: "v1",
            audioMimeType: "audio/mpeg",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    const request = new Request("http://localhost/api/bluum/lessons");
    const response = await GET(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toEqual(
      expect.objectContaining({
        id: "lesson_001_manual_save",
        slug: "manual-save",
        title: "Why everything feels like it's piling up",
        description: "Intro to Manual Save",
        order: 1,
        durationSec: 127,
        tags: ["negativity", "mood"],
        version: "v1",
        audioUrl: "https://example.com/manual-save.mp3",
        audioMimeType: "audio/mpeg",
      })
    );

    expect(payload.items[1]).toEqual(
      expect.objectContaining({
        title: "Negativity Bias",
        slug: "negativity-bias",
        description: "",
        order: null,
        audioUrl: "https://example.com/negativity-bias.mp3",
        audioMimeType: "audio/mpeg",
      })
    );
  });

  it("maps auth errors", async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new AuthError("Unauthorized", 401)
    );

    const request = new Request("http://localhost/api/bluum/lessons");
    const response = await GET(request as any);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized");
  });
});
