/**
 * Auth helper for API routes.
 * Verifies Clerk auth and resolves/creates DB user.
 */

import { auth } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export interface AuthenticatedUser {
  user: User;
  clerkUserId: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Require authenticated user for API routes.
 * Creates DB user if not exists (handles race with webhook).
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const clerkUserId = await resolveClerkUserId();

  if (!clerkUserId) {
    throw new AuthError("Unauthorized", 401);
  }

  // Find or create user in database
  let user = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (!user) {
    // User not yet synced from webhook, create minimal record
    user = await prisma.user.upsert({
      where: { clerkUserId },
      update: {},
      create: { clerkUserId },
    });
  }

  return { user, clerkUserId };
}

function getBearerTokenFromHeaders(): string | null {
  const requestHeaders = headers();
  const authHeader =
    requestHeaders.get("authorization") ??
    requestHeaders.get("Authorization");

  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+/i);
  if (!match) {
    return null;
  }

  const token = authHeader.slice(match[0].length).trim();
  return token.length ? token : null;
}

function parseAuthorizedParties(): string[] | undefined {
  const raw = process.env.CLERK_AUTHORIZED_PARTIES;
  if (!raw) {
    return undefined;
  }

  const parties = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parties.length ? parties : undefined;
}

async function resolveClerkUserId(): Promise<string | null> {
  const bearerToken = getBearerTokenFromHeaders();

  if (bearerToken) {
    const jwtKey = process.env.CLERK_JWT_KEY;
    const authorizedParties = parseAuthorizedParties();
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction && (!jwtKey || !authorizedParties?.length)) {
      throw new AuthError("Unauthorized", 401);
    }

    try {
      const payload = await verifyToken(bearerToken, {
        jwtKey,
        authorizedParties,
      });
      const bearerUserId = payload?.sub;

      if (!bearerUserId) {
        throw new AuthError("Unauthorized", 401);
      }

      return bearerUserId;
    } catch {
      throw new AuthError("Unauthorized", 401);
    }
  }

  const { userId } = await auth();
  return userId ?? null;
}

/**
 * JSON error response helper.
 */
export function errorResponse(
  message: string,
  status: number = 400
): Response {
  return Response.json({ error: message }, { status });
}
