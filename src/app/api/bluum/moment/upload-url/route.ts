/**
 * POST /api/bluum/moment/upload-url
 * Generate a signed upload URL for moment images.
 */

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser, AuthError, errorResponse } from "@/lib/auth/requireUser";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();

    // Generate a unique filename
    const timestamp = Date.now();
    const filename = `moments/${user.id}/${timestamp}.jpg`;

    // Use Vercel Blob to create a client upload URL
    // Note: For client uploads, you'd typically use generateClientTokenFromReadWriteToken
    // For now, we'll create a placeholder implementation
    // TODO: Implement proper client-side upload flow if needed

    // For server-side upload testing, we can upload a placeholder
    const blob = await put(filename, new Blob(["placeholder"]), {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({
      uploadUrl: blob.url, // In production, this would be a signed upload URL
      publicUrl: blob.url,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("POST /api/bluum/moment/upload-url error:", err);
    return errorResponse("Internal server error", 500);
  }
}
