/**
 * Activity engagement history — fetches and formats user activity data.
 * Used for LLM context injection and the activity/history API endpoint.
 */

import { prisma } from "@/lib/prisma";
import { ActivityType, ActivityOutcome } from "@prisma/client";

export type ActivitySummaryItem = {
  activityType: string;
  activitySlug: string;
  lastDoneAt: string | null;        // ISO datetime
  totalSessions: number;
  completedSessions: number;        // COMPLETED outcomes
  lastOutcome: string | null;
  lastCompletedPct: number | null;  // for lessons / breathing
  bestScore: number | null;         // for games
  lastScore: number | null;         // for games
  selfInitiatedCount: number;
  llmSuggestedCount: number;
};

export type ActivityHistorySummary = {
  items: ActivitySummaryItem[];
};

export async function getActivityHistorySummary(
  userId: string
): Promise<ActivityHistorySummary> {
  // Fetch all engagements for user, most recent first
  const engagements = await prisma.activityEngagement.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: {
      activityType: true,
      activitySlug: true,
      source: true,
      outcome: true,
      completedPct: true,
      score: true,
      startedAt: true,
    },
  });

  // Group by activityType + activitySlug
  const grouped = new Map<
    string,
    (typeof engagements)[number][]
  >();

  for (const e of engagements) {
    const key = `${e.activityType}::${e.activitySlug}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  const items: ActivitySummaryItem[] = [];

  for (const [key, records] of grouped) {
    const [activityType, activitySlug] = key.split("::");
    const mostRecent = records[0]; // already sorted desc

    const completedRecords = records.filter(
      (r) => r.outcome === ActivityOutcome.COMPLETED
    );

    const scores = records
      .map((r) => r.score)
      .filter((s): s is number => s !== null);

    items.push({
      activityType,
      activitySlug,
      lastDoneAt: mostRecent.startedAt.toISOString(),
      totalSessions: records.length,
      completedSessions: completedRecords.length,
      lastOutcome: mostRecent.outcome,
      lastCompletedPct: mostRecent.completedPct ?? null,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
      lastScore: scores.length > 0 ? scores[0] : null,
      selfInitiatedCount: records.filter((r) => r.source === "SELF_INITIATED")
        .length,
      llmSuggestedCount: records.filter((r) => r.source === "LLM_SUGGESTED")
        .length,
    });
  }

  return { items };
}

/**
 * Formats activity history as a compact string for LLM prompt injection.
 * Example output:
 *   LESSON morning-clarity: last done 2025-03-20, completed 3x (2 completed), last 100%
 *   BREATHING breathing-4-7-8: last done 2025-03-25, done 5x (5 completed)
 *   GAME impulse-pop: last done 2025-03-24, played 8x, best score 420, last score 380
 */
export function formatActivityHistoryForLLM(
  summary: ActivityHistorySummary
): string {
  if (summary.items.length === 0) {
    return "No activity history yet.";
  }

  return summary.items
    .map((item) => {
      const lastDone = item.lastDoneAt
        ? item.lastDoneAt.slice(0, 10)
        : "never";
      const base = `${item.activityType} ${item.activitySlug}: last done ${lastDone}, done ${item.totalSessions}x (${item.completedSessions} completed)`;

      if (
        item.activityType === ActivityType.LESSON ||
        item.activityType === ActivityType.BREATHING
      ) {
        const pct =
          item.lastCompletedPct !== null
            ? `, last ${Math.round(item.lastCompletedPct * 100)}%`
            : "";
        return base + pct;
      }

      if (item.activityType === ActivityType.GAME) {
        const scores =
          item.bestScore !== null
            ? `, best score ${item.bestScore}, last score ${item.lastScore}`
            : "";
        return base + scores;
      }

      return base;
    })
    .join("\n");
}
