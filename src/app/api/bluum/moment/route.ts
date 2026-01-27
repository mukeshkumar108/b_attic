/**
 * POST /api/bluum/moment
 * Create a gratitude moment (quick capture).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

const momentSchema = z
  .object({
    text: z
      .string()
      .max(280, "Text must be 280 characters or less")
      .optional()
      .nullable(),
    imageUrl: z.string().url().optional().nullable(),
  })
  .refine((data) => data.text || data.imageUrl, {
    message: "Either text or imageUrl is required",
  });

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = momentSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { text, imageUrl } = parsed.data;

    const moment = await prisma.gratitudeMoment.create({
      data: {
        userId: user.id,
        text: text || null,
        imageUrl: imageUrl || null,
      },
    });

    return NextResponse.json({ saved: true, id: moment.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/moment error:", err);
    return errorResponse("Internal server error", 500);
  }
}
