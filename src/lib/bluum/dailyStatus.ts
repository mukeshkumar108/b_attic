/**
 * Daily status management.
 * Handles creation and retrieval of DailyStatus records.
 */

import { prisma } from "@/lib/prisma";
import { selectPromptForDate } from "./promptPolicy";
import { getPrimaryTag } from "./prompts";
import type { DailyStatus, PromptHistory } from "@prisma/client";

export interface DailyStatusResult {
  status: DailyStatus;
  promptHistory: PromptHistory;
  isNew: boolean;
}

/**
 * Get or create DailyStatus for a user and date.
 * If new, selects a prompt and creates PromptHistory.
 */
export async function getOrCreateDailyStatus(
  userId: string,
  dateLocal: string
): Promise<DailyStatusResult> {
  // Check if already exists
  const existing = await prisma.dailyStatus.findUnique({
    where: { userId_dateLocal: { userId, dateLocal } },
  });

  if (existing) {
    const promptHistory = await prisma.promptHistory.findUnique({
      where: { userId_dateLocal: { userId, dateLocal } },
    });
    return {
      status: existing,
      promptHistory: promptHistory!,
      isNew: false,
    };
  }

  // Get recent prompt history for rotation logic
  const recentHistory = await prisma.promptHistory.findMany({
    where: { userId },
    orderBy: { dateLocal: "desc" },
    take: 5,
  });

  const recentHistoryTags = recentHistory.map((h) => {
    const tags = h.tagsUsed as string[];
    return tags[0] || "general";
  });
  const recentPromptIds = recentHistory.map((h) => h.promptId);

  // Select prompt
  const prompt = selectPromptForDate({
    userId,
    dateLocal,
    recentHistoryTags,
    recentPromptIds,
  });

  // Create both records in transaction
  const [status, promptHistory] = await prisma.$transaction([
    prisma.dailyStatus.create({
      data: {
        userId,
        dateLocal,
        promptId: prompt.id,
        promptText: prompt.text,
      },
    }),
    prisma.promptHistory.create({
      data: {
        userId,
        dateLocal,
        promptId: prompt.id,
        tagsUsed: prompt.tags,
      },
    }),
  ]);

  return { status, promptHistory, isNew: true };
}

/**
 * Update DailyStatus prompt after swap.
 */
export async function updateDailyStatusPrompt(
  userId: string,
  dateLocal: string,
  newPromptId: string,
  newPromptText: string,
  newPromptTags: string[]
): Promise<DailyStatus> {
  const [status] = await prisma.$transaction([
    prisma.dailyStatus.update({
      where: { userId_dateLocal: { userId, dateLocal } },
      data: {
        promptId: newPromptId,
        promptText: newPromptText,
        didSwapPrompt: true,
      },
    }),
    prisma.promptHistory.update({
      where: { userId_dateLocal: { userId, dateLocal } },
      data: {
        promptId: newPromptId,
        tagsUsed: newPromptTags,
      },
    }),
  ]);

  return status;
}
