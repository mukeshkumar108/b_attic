/**
 * POST /api/bluum/mood
 * Log daily mood rating.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";
import { getOrCreateDailyStatus } from "@/lib/bluum/dailyStatus";

const moodSchema = z.object({
  dateLocal: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  tags: z
    .array(z.string())
    .max(5, "Maximum 5 tags allowed")
    .optional()
    .nullable(),
  note: z
    .string()
    .max(200, "Note must be 200 characters or less")
    .optional()
    .nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = moodSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { dateLocal: dateLocalParam, rating, tags, note } = parsed.data;

    // Validate if provided
    if (dateLocalParam && !validateDateLocal(dateLocalParam)) {
      return errorResponse(
        "Invalid dateLocal format (expected YYYY-MM-DD)",
        400
      );
    }

    const dateLocal = ensureDateLocal(dateLocalParam, user.timezone);

    // Ensure DailyStatus exists
    await getOrCreateDailyStatus(user.id, dateLocal);

    // Upsert mood log
    const tagsValue = tags ? tags : Prisma.JsonNull;
    await prisma.moodLog.upsert({
      where: { userId_dateLocal: { userId: user.id, dateLocal } },
      update: {
        rating,
        tags: tagsValue,
        note: note || null,
      },
      create: {
        userId: user.id,
        dateLocal,
        rating,
        tags: tagsValue,
        note: note || null,
      },
    });

    // Update daily status
    await prisma.dailyStatus.update({
      where: { userId_dateLocal: { userId: user.id, dateLocal } },
      data: { hasMood: true },
    });

    return NextResponse.json({ saved: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/mood error:", err);
    return errorResponse("Internal server error", 500);
  }
}
