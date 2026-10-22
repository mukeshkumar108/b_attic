/**
 * GET/PUT /api/bluum/profile
 * What the person shares about themselves: what to call them, pronouns, gender, birth year. Email comes from their account and is read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";
import { normaliseProfileUpdate, profileUpdateSchema } from "@/lib/bluum/profile";

type ProfileFields = { displayName?: string | null; email?: string | null; pronouns?: string | null; gender?: string | null; birthYear?: number | null };

const shape = (u: ProfileFields) => ({
  displayName: u.displayName ?? null,
  email: u.email ?? null,
  pronouns: u.pronouns ?? null,
  gender: u.gender ?? null,
  birthYear: u.birthYear ?? null,
});

export async function GET() {
  try {
    const { user } = await requireUser();
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    return NextResponse.json({ profile: shape((row ?? {}) as ProfileFields) });
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.statusCode);
    console.error("GET /api/bluum/profile error:", err);
    return errorResponse("Internal server error", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Invalid profile", 400);
    const data = normaliseProfileUpdate(parsed.data);
    const row = await prisma.user.update({ where: { id: user.id }, data: data as never });
    return NextResponse.json({ profile: shape(row as ProfileFields) });
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.statusCode);
    console.error("PUT /api/bluum/profile error:", err);
    return errorResponse("Internal server error", 500);
  }
}
