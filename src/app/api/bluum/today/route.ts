/**
 * GET /api/bluum/today
 * Get daily status including prompt for today.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";
import { getOrCreateDailyStatus } from "@/lib/bluum/dailyStatus";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser();

    // Get dateLocal from query or compute from timezone
    const { searchParams } = new URL(request.url);
    const dateLocalParam = searchParams.get("dateLocal");

    // Validate if provided
    if (dateLocalParam && !validateDateLocal(dateLocalParam)) {
      return errorResponse("Invalid dateLocal format (expected YYYY-MM-DD)", 400);
    }

    const dateLocal = ensureDateLocal(dateLocalParam, user.timezone);

    // Get or create daily status
    const { status } = await getOrCreateDailyStatus(user.id, dateLocal);

    return NextResponse.json({
      dateLocal,
      onboardingCompleted: user.onboardingCompletedAt !== null,
      hasReflected: status.hasReflection,
      hasMood: status.hasMood,
      prompt: {
        id: status.promptId,
        text: status.promptText,
      },
      didSwapPrompt: status.didSwapPrompt,
      primaryCta: "reflect",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/today error:", err);
    return errorResponse("Internal server error", 500);
  }
}
