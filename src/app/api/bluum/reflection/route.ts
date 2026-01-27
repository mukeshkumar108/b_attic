/**
 * POST /api/bluum/reflection
 * Submit a daily gratitude reflection.
 * Write-once: returns 409 if reflection exists for dateLocal.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";
import { getOrCreateDailyStatus } from "@/lib/bluum/dailyStatus";
import {
  runSafetyGate,
  runRubricCoach,
  getSafetyResponse,
} from "@/lib/bluum/coaching";
import { getSuccessMessage } from "@/lib/bluum/messages/successMessages";

const reflectionSchema = z.object({
  dateLocal: z.string().optional().nullable(),
  responseText: z
    .string()
    .min(1, "Response text is required")
    .max(2000, "Response text must be 2000 characters or less"),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = reflectionSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { dateLocal: dateLocalParam, responseText } = parsed.data;

    // Validate if provided
    if (dateLocalParam && !validateDateLocal(dateLocalParam)) {
      return errorResponse(
        "Invalid dateLocal format (expected YYYY-MM-DD)",
        400
      );
    }

    const dateLocal = ensureDateLocal(dateLocalParam, user.timezone);

    // Check if reflection already exists (write-once)
    const existingReflection = await prisma.dailyReflection.findUnique({
      where: { userId_dateLocal: { userId: user.id, dateLocal } },
    });

    if (existingReflection) {
      return errorResponse(
        "Reflection already exists for this date. Reflections cannot be edited.",
        409
      );
    }

    // Ensure DailyStatus exists
    const { status } = await getOrCreateDailyStatus(user.id, dateLocal);

    // Get total reflections for milestone check
    const totalReflections = await prisma.dailyReflection.count({
      where: { userId: user.id },
    });

    // Get current streak for success message
    const streakData = await computeCurrentStreak(user.id, dateLocal);

    // === STEP 1: Run safety gate ===
    const safetyResult = await runSafetyGate({
      promptText: status.promptText,
      responseText,
    });

    if (safetyResult.flagged) {
      // Save reflection but with no coaching
      await prisma.$transaction([
        prisma.dailyReflection.create({
          data: {
            userId: user.id,
            dateLocal,
            promptId: status.promptId,
            promptText: status.promptText,
            responseText,
            coachType: "NONE",
            coachText: null,
          },
        }),
        prisma.dailyStatus.update({
          where: { userId_dateLocal: { userId: user.id, dateLocal } },
          data: { hasReflection: true },
        }),
      ]);

      // Return safe response with resources
      const safetyResponse = getSafetyResponse();

      return NextResponse.json({
        saved: true,
        safetyFlagged: true,
        safeResponse: safetyResponse,
        coach: null,
        successMessage: null,
      });
    }

    // === STEP 2: Run rubric coaching ===
    const coachResult = await runRubricCoach({
      promptText: status.promptText,
      responseText,
    });

    // Save reflection with coaching
    await prisma.$transaction([
      prisma.dailyReflection.create({
        data: {
          userId: user.id,
          dateLocal,
          promptId: status.promptId,
          promptText: status.promptText,
          responseText,
          coachType: coachResult.coachType,
          coachText: coachResult.coachText,
        },
      }),
      prisma.dailyStatus.update({
        where: { userId_dateLocal: { userId: user.id, dateLocal } },
        data: { hasReflection: true },
      }),
    ]);

    // Get success message
    const successMessage = getSuccessMessage({
      currentStreak: streakData.currentStreak,
      totalReflections,
      userId: user.id,
      dateLocal,
    });

    return NextResponse.json({
      saved: true,
      safetyFlagged: false,
      coach: {
        type: coachResult.coachType.toLowerCase(),
        text: coachResult.coachText,
      },
      successMessage,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/reflection error:", err);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * Compute current streak ending at dateLocal.
 * Simple implementation - counts consecutive days with hasReflection.
 */
async function computeCurrentStreak(
  userId: string,
  dateLocal: string
): Promise<{ currentStreak: number }> {
  // Get recent daily statuses ordered by date desc
  const statuses = await prisma.dailyStatus.findMany({
    where: {
      userId,
      hasReflection: true,
      dateLocal: { lte: dateLocal },
    },
    orderBy: { dateLocal: "desc" },
    take: 400, // Reasonable limit
    select: { dateLocal: true },
  });

  if (statuses.length === 0) {
    return { currentStreak: 0 };
  }

  // Count consecutive days from dateLocal backwards
  let streak = 0;
  let currentDate = new Date(dateLocal + "T00:00:00Z");

  for (const status of statuses) {
    const expectedDate = formatDateUTC(currentDate);
    if (status.dateLocal === expectedDate) {
      streak++;
      currentDate.setUTCDate(currentDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return { currentStreak: streak };
}

function formatDateUTC(date: Date): string {
  return date.toISOString().split("T")[0];
}
