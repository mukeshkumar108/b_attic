/**
 * GET /api/bluum/streaks
 * Get streak statistics for the user.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const { searchParams } = new URL(request.url);
    const dateLocalParam = searchParams.get("dateLocal");

    // Validate if provided
    if (dateLocalParam && !validateDateLocal(dateLocalParam)) {
      return errorResponse(
        "Invalid dateLocal format (expected YYYY-MM-DD)",
        400
      );
    }

    const dateLocal = ensureDateLocal(dateLocalParam, user.timezone);

    // Get all completed reflections for this user
    const completedDays = await prisma.dailyStatus.findMany({
      where: {
        userId: user.id,
        hasReflection: true,
      },
      orderBy: { dateLocal: "desc" },
      select: { dateLocal: true },
    });

    const totalReflections = completedDays.length;

    if (totalReflections === 0) {
      return NextResponse.json({
        dateLocal,
        currentStreak: 0,
        longestStreak: 0,
        totalReflections: 0,
      });
    }

    // Convert to Set for O(1) lookup
    const completedSet = new Set(completedDays.map((d) => d.dateLocal));

    // Calculate current streak (consecutive days ending at dateLocal or most recent)
    const currentStreak = calculateCurrentStreak(completedSet, dateLocal);

    // Calculate longest streak
    const longestStreak = calculateLongestStreak(
      completedDays.map((d) => d.dateLocal)
    );

    return NextResponse.json({
      dateLocal,
      currentStreak,
      longestStreak,
      totalReflections,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/streaks error:", err);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * Calculate current streak ending at or before dateLocal.
 */
function calculateCurrentStreak(
  completedSet: Set<string>,
  dateLocal: string
): number {
  let streak = 0;
  let currentDate = new Date(dateLocal + "T00:00:00Z");

  // First, find the most recent completed day at or before dateLocal
  while (!completedSet.has(formatDateUTC(currentDate))) {
    currentDate.setUTCDate(currentDate.getUTCDate() - 1);
    // Safety: don't go back more than a year
    if (streak > 365) break;
    streak++; // This is just a counter to prevent infinite loop
  }

  // Reset streak counter for actual calculation
  streak = 0;

  // Now count consecutive days
  while (completedSet.has(formatDateUTC(currentDate))) {
    streak++;
    currentDate.setUTCDate(currentDate.getUTCDate() - 1);
  }

  return streak;
}

/**
 * Calculate longest streak from a sorted list of dates (desc order).
 */
function calculateLongestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;

  // Sort ascending for easier calculation
  const sortedDates = [...dates].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1] + "T00:00:00Z");
    const currDate = new Date(sortedDates[i] + "T00:00:00Z");

    // Check if consecutive
    prevDate.setUTCDate(prevDate.getUTCDate() + 1);
    if (formatDateUTC(prevDate) === sortedDates[i]) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function formatDateUTC(date: Date): string {
  return date.toISOString().split("T")[0];
}
