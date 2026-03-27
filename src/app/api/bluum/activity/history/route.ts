/**
 * GET /api/bluum/activity/history
 * Returns a summary of the user's activity engagement history.
 * Used to inject context into the LLM at session start.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { getActivityHistorySummary } from "@/lib/bluum/activityHistory";

export async function GET(_request: NextRequest) {
  try {
    const { user } = await requireUser();
    const summary = await getActivityHistorySummary(user.id);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/activity/history error:", err);
    return errorResponse("Internal server error", 500);
  }
}
