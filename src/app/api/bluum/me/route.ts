/**
 * GET /api/bluum/me
 * Returns current user profile.
 */

import { NextResponse } from "next/server";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

export async function GET() {
  try {
    const { user } = await requireUser();

    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        timezone: user.timezone,
        onboardingCompleted: user.onboardingCompletedAt !== null,
        reflectionReminderEnabled: user.reflectionReminderEnabled,
        reflectionReminderTimeLocal: user.reflectionReminderTimeLocal,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/me error:", err);
    return errorResponse("Internal server error", 500);
  }
}
