/**
 * GET /api/bluum/lessons
 * Returns lesson/snack audio catalog from Vercel Blob.
 */

import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, errorResponse, requireUser } from "@/lib/auth/requireUser";

interface BlobEntry {
  pathname: string;
  url: string;
  uploadedAt: Date;
}

interface LessonMetadata {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  order?: number;
  durationSec?: number;
  tags?: string[];
  version?: string;
  published?: boolean;
  audioMimeType?: string;
}

interface LessonItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number | null;
  durationSec: number | null;
  tags: string[];
  version: string | null;
  audioUrl: string;
  audioMimeType: string;
  uploadedAt: string;
  pathname: string;
}

const LESSONS_PREFIX = "voice/lessons/";
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".webm", ".ogg"]);

function getExtension(pathname: string): string {
  const dotIndex = pathname.lastIndexOf(".");
  if (dotIndex < 0) {
    return "";
  }
  return pathname.slice(dotIndex).toLowerCase();
}

function getStem(pathname: string): string {
  const filename = pathname.split("/").pop() ?? pathname;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex < 0) {
    return filename;
  }
  return filename.slice(0, dotIndex);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleFromStem(stem: string): string {
  const raw = stem
    .replace(/^bluum[_-]?lesson[_-]?/i, "")
    .replace(/[_-]?v\d+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!raw) {
    return "Lesson";
  }
  return raw
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isValidTags(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((tag) => typeof tag === "string" && tag.trim().length > 0)
  );
}

function parseLessonMetadata(value: unknown): LessonMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const metadata: LessonMetadata = {};

  if (typeof raw.id === "string" && raw.id.trim()) {
    metadata.id = raw.id.trim();
  }
  if (typeof raw.slug === "string" && raw.slug.trim()) {
    metadata.slug = raw.slug.trim();
  }
  if (typeof raw.title === "string" && raw.title.trim()) {
    metadata.title = raw.title.trim();
  }
  if (typeof raw.description === "string") {
    metadata.description = raw.description.trim();
  }
  if (typeof raw.order === "number" && Number.isFinite(raw.order)) {
    metadata.order = raw.order;
  }
  if (typeof raw.durationSec === "number" && Number.isFinite(raw.durationSec)) {
    metadata.durationSec = raw.durationSec;
  }
  if (isValidTags(raw.tags)) {
    metadata.tags = raw.tags.map((tag) => tag.trim());
  }
  if (typeof raw.version === "string" && raw.version.trim()) {
    metadata.version = raw.version.trim();
  }
  if (typeof raw.published === "boolean") {
    metadata.published = raw.published;
  }
  if (typeof raw.audioMimeType === "string" && raw.audioMimeType.trim()) {
    metadata.audioMimeType = raw.audioMimeType.trim();
  }

  return metadata;
}

function mimeTypeFromPathname(pathname: string): string {
  const extension = getExtension(pathname);
  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

async function listAllLessonBlobs(): Promise<BlobEntry[]> {
  const blobs: BlobEntry[] = [];
  let cursor: string | undefined;

  do {
    const result = await list({
      prefix: LESSONS_PREFIX,
      cursor,
      limit: 1000,
    });
    blobs.push(
      ...result.blobs.map((blob) => ({
        pathname: blob.pathname,
        url: blob.url,
        uploadedAt: blob.uploadedAt,
      }))
    );
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return blobs;
}

async function fetchMetadataByStem(
  metadataBlobs: BlobEntry[]
): Promise<Map<string, LessonMetadata>> {
  const metadataByStem = new Map<string, LessonMetadata>();

  await Promise.all(
    metadataBlobs.map(async (blob) => {
      try {
        const response = await fetch(blob.url);
        if (!response.ok) {
          return;
        }
        const json = await response.json();
        const parsed = parseLessonMetadata(json);
        if (!parsed) {
          return;
        }
        metadataByStem.set(getStem(blob.pathname), parsed);
      } catch {
        // Best-effort metadata load; lesson still remains available via audio blob.
      }
    })
  );

  return metadataByStem;
}

function buildLessonItems(params: {
  audioBlobs: BlobEntry[];
  metadataByStem: Map<string, LessonMetadata>;
}): LessonItem[] {
  const items = params.audioBlobs
    .map((audioBlob) => {
      const stem = getStem(audioBlob.pathname);
      const metadata = params.metadataByStem.get(stem);
      if (metadata?.published === false) {
        return null;
      }

      const fallbackSlug = toSlug(toTitleFromStem(stem));
      const slug = metadata?.slug || fallbackSlug;
      const id = metadata?.id || slug;
      const title = metadata?.title || toTitleFromStem(stem);
      const description = metadata?.description || "";

      return {
        id,
        slug,
        title,
        description,
        order: typeof metadata?.order === "number" ? metadata.order : null,
        durationSec:
          typeof metadata?.durationSec === "number" ? metadata.durationSec : null,
        tags: metadata?.tags ?? [],
        version: metadata?.version ?? null,
        audioUrl: audioBlob.url,
        audioMimeType:
          metadata?.audioMimeType || mimeTypeFromPathname(audioBlob.pathname),
        uploadedAt: audioBlob.uploadedAt.toISOString(),
        pathname: audioBlob.pathname,
      } satisfies LessonItem;
    })
    .filter((item): item is LessonItem => Boolean(item));

  items.sort((a, b) => {
    if (a.order !== null && b.order !== null) {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
    } else if (a.order !== null) {
      return -1;
    } else if (b.order !== null) {
      return 1;
    }
    return a.pathname.localeCompare(b.pathname);
  });

  return items;
}

export async function GET(_request: NextRequest) {
  try {
    await requireUser();

    const blobs = await listAllLessonBlobs();
    const audioBlobs = blobs.filter((blob) =>
      AUDIO_EXTENSIONS.has(getExtension(blob.pathname))
    );
    const metadataBlobs = blobs.filter(
      (blob) => getExtension(blob.pathname) === ".json"
    );

    const metadataByStem = await fetchMetadataByStem(metadataBlobs);
    const items = buildLessonItems({ audioBlobs, metadataByStem });

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("GET /api/bluum/lessons error:", err);
    return errorResponse("Internal server error", 500);
  }
}
