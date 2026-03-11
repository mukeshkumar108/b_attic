import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  requireUser,
  type AuthenticatedUser,
} from "@/lib/auth/requireUser";

function getVoiceTestAuthConfig() {
  const apiKey = process.env.VOICE_TEST_API_KEY?.trim();
  const userId = process.env.VOICE_TEST_USER_ID?.trim();
  return { apiKey, userId };
}

function getProvidedVoiceTestApiKey(request: NextRequest): string | null {
  const value = request.headers.get("x-voice-test-api-key")?.trim();
  return value || null;
}

/**
 * Voice endpoints primarily use normal user auth via Clerk.
 * For smoke testing in hosted environments, an optional API key mode can be enabled:
 * - Set VOICE_TEST_API_KEY and VOICE_TEST_USER_ID
 * - Send x-voice-test-api-key header
 */
export async function requireVoiceUser(
  request: NextRequest
): Promise<AuthenticatedUser> {
  try {
    return await requireUser();
  } catch (err) {
    if (!(err instanceof AuthError)) {
      throw err;
    }
  }

  const { apiKey, userId } = getVoiceTestAuthConfig();
  const providedApiKey = getProvidedVoiceTestApiKey(request);

  if (!apiKey || !userId || !providedApiKey || providedApiKey !== apiKey) {
    throw new AuthError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }

  return {
    user,
    clerkUserId: user.clerkUserId,
  };
}
