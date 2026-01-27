/**
 * GET /api/bluum/moments
 * List gratitude moments with cursor pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser();

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const query = searchParams.get("q");

    // Parse and validate limit
    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10), 1), 100);

    // Build where clause
    const where: {
      userId: string;
      id?: { lt: string };
      text?: { contains: string; mode: "insensitive" };
    } = {
      userId: user.id,
    };

    // Cursor-based pagination (newest first, so cursor is "less than")
    if (cursor) {
      where.id = { lt: cursor };
    }

    // Text search (simple ILIKE)
    if (query) {
      where.text = { contains: query, mode: "insensitive" };
    }

    const moments = await prisma.gratitudeMoment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1, // Fetch one extra to determine if there's more
      select: {
        id: true,
        text: true,
        imageUrl: true,
        createdAt: true,
      },
    });

    // Determine if there's a next page
    let nextCursor: string | null = null;
    if (moments.length > limit) {
      const nextItem = moments.pop();
      nextCursor = nextItem?.id || null;
    }

    return NextResponse.json({
      items: moments,
      nextCursor,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/moments error:", err);
    return errorResponse("Internal server error", 500);
  }
}
