/**
 * GET /api/bluum/summaries
 * List user summaries (weekly/monthly).
 * No generation engine now - returns stored summaries only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const limitParam = searchParams.get("limit");

    // Validate type
    let periodType: string | undefined;
    if (typeParam === "weekly") {
      periodType = "WEEKLY";
    } else if (typeParam === "monthly") {
      periodType = "MONTHLY";
    } else if (typeParam) {
      return errorResponse("Invalid type. Use 'weekly' or 'monthly'.", 400);
    }

    // Parse limit
    const limit = Math.min(Math.max(parseInt(limitParam || "12", 10), 1), 50);

    // Build query
    const where: { userId: string; periodType?: string } = {
      userId: user.id,
    };
    if (periodType) {
      where.periodType = periodType;
    }

    const summaries = await prisma.userSummary.findMany({
      where,
      orderBy: { periodStartLocal: "desc" },
      take: limit,
      select: {
        id: true,
        periodType: true,
        periodStartLocal: true,
        periodEndLocal: true,
        summaryText: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      items: summaries,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/summaries error:", err);
    return errorResponse("Internal server error", 500);
  }
}
