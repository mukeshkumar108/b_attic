/**
 * POST /api/bluum/reflection/addendum
 * Add an addendum to today's reflection.
 * Same-day only, once per day, no rubric re-run.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import {
  ensureDateLocal,
  validateDateLocal,
  getDateLocalForUser,
} from "@/lib/bluum/dateLocal";

const addendumSchema = z.object({
  dateLocal: z.string().optional().nullable(),
  text: z
    .string()
    .min(1, "Addendum text is required")
    .max(400, "Addendum text must be 400 characters or less"),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = addendumSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { dateLocal: dateLocalParam, text } = parsed.data;

    // Validate if provided
    if (dateLocalParam && !validateDateLocal(dateLocalParam)) {
      return errorResponse(
        "Invalid dateLocal format (expected YYYY-MM-DD)",
        400
      );
    }

    const dateLocal = ensureDateLocal(dateLocalParam, user.timezone);

    // Check same-day restriction
    const todayLocal = getDateLocalForUser(user.timezone);
    if (dateLocal !== todayLocal) {
      return errorResponse(
        "Addendum can only be added for today's reflection",
        400
      );
    }

    // Check if reflection exists
    const reflection = await prisma.dailyReflection.findUnique({
      where: { userId_dateLocal: { userId: user.id, dateLocal } },
    });

    if (!reflection) {
      return errorResponse(
        "No reflection exists for this date. Submit a reflection first.",
        400
      );
    }

    // Check if addendum already exists
    const existingAddendum = await prisma.reflectionAddendum.findUnique({
      where: { userId_dateLocal: { userId: user.id, dateLocal } },
    });

    if (existingAddendum) {
      return errorResponse("Addendum already exists for this date", 409);
    }

    // Create addendum (no rubric re-run per spec)
    await prisma.reflectionAddendum.create({
      data: {
        userId: user.id,
        dateLocal,
        text,
      },
    });

    return NextResponse.json({
      saved: true,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/reflection/addendum error:", err);
    return errorResponse("Internal server error", 500);
  }
}
