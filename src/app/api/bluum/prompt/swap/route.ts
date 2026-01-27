/**
 * POST /api/bluum/prompt/swap
 * Swap today's prompt for an alternate one.
 * Max 1 swap per day.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";
import { pickAlternatePromptForSwap } from "@/lib/bluum/promptPolicy";
import { updateDailyStatusPrompt } from "@/lib/bluum/dailyStatus";

const swapSchema = z.object({
  dateLocal: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await request.json();
    const parsed = swapSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { dateLocal: dateLocalParam } = parsed.data;

    // Validate if provided
    if (dateLocalParam && !validateDateLocal(dateLocalParam)) {
      return errorResponse("Invalid dateLocal format (expected YYYY-MM-DD)", 400);
    }

    const dateLocal = ensureDateLocal(dateLocalParam, user.timezone);

    // Get current daily status
    const status = await prisma.dailyStatus.findUnique({
      where: { userId_dateLocal: { userId: user.id, dateLocal } },
    });

    if (!status) {
      return errorResponse(
        "No daily status exists for this date. Call /api/bluum/today first.",
        400
      );
    }

    // Check if already swapped
    if (status.didSwapPrompt) {
      return errorResponse("Prompt already swapped today", 409);
    }

    // Check if reflection already submitted
    if (status.hasReflection) {
      return errorResponse("Cannot swap prompt after reflection submitted", 409);
    }

    // Get recent history for swap selection
    const recentHistory = await prisma.promptHistory.findMany({
      where: { userId: user.id },
      orderBy: { dateLocal: "desc" },
      take: 5,
    });

    const recentHistoryTags = recentHistory.map((h) => {
      const tags = h.tagsUsed as string[];
      return tags[0] || "general";
    });
    const recentPromptIds = recentHistory.map((h) => h.promptId);

    // Pick alternate prompt
    const newPrompt = pickAlternatePromptForSwap(status.promptId, {
      userId: user.id,
      dateLocal,
      recentHistoryTags,
      recentPromptIds,
    });

    // Update status and history
    const updatedStatus = await updateDailyStatusPrompt(
      user.id,
      dateLocal,
      newPrompt.id,
      newPrompt.text,
      newPrompt.tags
    );

    return NextResponse.json({
      prompt: {
        id: updatedStatus.promptId,
        text: updatedStatus.promptText,
      },
      didSwapPrompt: updatedStatus.didSwapPrompt,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/prompt/swap error:", err);
    return errorResponse("Internal server error", 500);
  }
}
