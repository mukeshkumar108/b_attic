/**
 * POST /api/bluum/onboarding
 * Complete user onboarding with profile info.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

// Basic IANA timezone pattern (e.g., "America/New_York", "Europe/London")
const TIMEZONE_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const TIME_LOCAL_REGEX = /^\d{2}:\d{2}$/;

const onboardingSchema = z.object({
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(50, "Display name must be 50 characters or less"),
  timezone: z
    .string()
    .regex(TIMEZONE_REGEX, "Invalid timezone format")
    .optional()
    .nullable(),
  reflectionReminderEnabled: z.boolean().optional(),
  reflectionReminderTimeLocal: z
    .string()
    .regex(TIME_LOCAL_REGEX, "Time must be in HH:MM format")
    .optional()
    .nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const {
      displayName,
      timezone,
      reflectionReminderEnabled,
      reflectionReminderTimeLocal,
    } = parsed.data;

    // Validate timeLocal is required if reminders are enabled
    if (reflectionReminderEnabled && !reflectionReminderTimeLocal) {
      return errorResponse(
        "Reminder time is required when reminders are enabled",
        400
      );
    }

    // Validate timezone if provided by trying to use it
    if (timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return errorResponse("Invalid timezone", 400);
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName,
        timezone: timezone || null,
        reflectionReminderEnabled: reflectionReminderEnabled ?? true,
        reflectionReminderTimeLocal: reflectionReminderTimeLocal || null,
        onboardingCompletedAt: user.onboardingCompletedAt || new Date(),
      },
    });

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        displayName: updatedUser.displayName,
        timezone: updatedUser.timezone,
        onboardingCompleted: updatedUser.onboardingCompletedAt !== null,
        reflectionReminderEnabled: updatedUser.reflectionReminderEnabled,
        reflectionReminderTimeLocal: updatedUser.reflectionReminderTimeLocal,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/onboarding error:", err);
    return errorResponse("Internal server error", 500);
  }
}
