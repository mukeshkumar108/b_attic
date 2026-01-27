/**
 * Auth helper for API routes.
 * Verifies Clerk auth and resolves/creates DB user.
 */

import { auth } from "@clerk/nextjs/server";
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
  const { userId: clerkUserId } = await auth();

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

/**
 * JSON error response helper.
 */
export function errorResponse(
  message: string,
  status: number = 400
): Response {
  return Response.json({ error: message }, { status });
}
