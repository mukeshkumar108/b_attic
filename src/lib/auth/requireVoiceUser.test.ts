import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/requireUser", () => ({
  requireUser: vi.fn(),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = "AuthError";
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { requireUser, AuthError } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/prisma";
import { requireVoiceUser } from "@/lib/auth/requireVoiceUser";

function makeRequest(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/bluum/voice/session/start", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}

describe("requireVoiceUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VOICE_TEST_API_KEY;
    delete process.env.VOICE_TEST_USER_ID;
  });

  it("returns normal auth user when requireUser succeeds", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", clerkUserId: "clerk_1" } as any,
      clerkUserId: "clerk_1",
    });

    const result = await requireVoiceUser(makeRequest() as any);

    expect(result.user.id).toBe("u1");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("uses voice test key fallback when configured", async () => {
    vi.mocked(requireUser).mockRejectedValue(new AuthError("Unauthorized", 401));
    process.env.VOICE_TEST_API_KEY = "test-key";
    process.env.VOICE_TEST_USER_ID = "db-user-1";
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "db-user-1",
      clerkUserId: "clerk_test",
    } as any);

    const result = await requireVoiceUser(
      makeRequest({ "x-voice-test-api-key": "test-key" }) as any
    );

    expect(result.user.id).toBe("db-user-1");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "db-user-1" },
    });
  });

  it("rejects when fallback key is missing", async () => {
    vi.mocked(requireUser).mockRejectedValue(new AuthError("Unauthorized", 401));
    process.env.VOICE_TEST_API_KEY = "test-key";
    process.env.VOICE_TEST_USER_ID = "db-user-1";

    await expect(requireVoiceUser(makeRequest() as any)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
