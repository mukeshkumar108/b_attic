/**
 * Unit tests for requireUser auth helper.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "./requireUser";

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLERK_AUTHORIZED_PARTIES;
    process.env.CLERK_JWT_KEY = "test-jwt-key";
  });

  it("authenticates via bearer token when present and valid", async () => {
    vi.mocked(headers).mockReturnValue(
      new Headers({ Authorization: "Bearer test.jwt.token" }) as any
    );
    vi.mocked(verifyToken).mockResolvedValue({ sub: "user_bearer" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "db-user-1",
      clerkUserId: "user_bearer",
    } as any);

    const result = await requireUser();

    expect(result.clerkUserId).toBe("user_bearer");
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { clerkUserId: "user_bearer" },
    });
  });

  it("rejects invalid bearer token without falling back", async () => {
    vi.mocked(headers).mockReturnValue(
      new Headers({ authorization: "Bearer bad.token" }) as any
    );
    vi.mocked(verifyToken).mockRejectedValue(new Error("invalid"));

    await expect(requireUser()).rejects.toMatchObject<AuthError>({
      statusCode: 401,
    });

    expect(auth).not.toHaveBeenCalled();
  });

  it("falls back to cookie session when no bearer token", async () => {
    vi.mocked(headers).mockReturnValue(new Headers() as any);
    vi.mocked(auth).mockResolvedValue({ userId: "user_cookie" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "db-user-2",
      clerkUserId: "user_cookie",
    } as any);

    const result = await requireUser();

    expect(result.clerkUserId).toBe("user_cookie");
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("throws AuthError when unauthenticated", async () => {
    vi.mocked(headers).mockReturnValue(new Headers() as any);
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);

    await expect(requireUser()).rejects.toMatchObject<AuthError>({
      statusCode: 401,
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
