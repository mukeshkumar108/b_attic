/**
 * Unit tests for streak calculations.
 */

import { describe, it, expect } from "vitest";

/**
 * Streak calculation logic (mirrored from streaks route for testing)
 */
function calculateCurrentStreak(
  completedSet: Set<string>,
  dateLocal: string
): number {
  let streak = 0;
  let currentDate = new Date(dateLocal + "T00:00:00Z");

  // First, find the most recent completed day at or before dateLocal
  let searchCount = 0;
  while (!completedSet.has(formatDateUTC(currentDate)) && searchCount < 365) {
    currentDate.setUTCDate(currentDate.getUTCDate() - 1);
    searchCount++;
  }

  // If no completed day found, return 0
  if (!completedSet.has(formatDateUTC(currentDate))) {
    return 0;
  }

  // Now count consecutive days
  while (completedSet.has(formatDateUTC(currentDate))) {
    streak++;
    currentDate.setUTCDate(currentDate.getUTCDate() - 1);
  }

  return streak;
}

function calculateLongestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;

  const sortedDates = [...dates].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1] + "T00:00:00Z");
    const currDate = new Date(sortedDates[i] + "T00:00:00Z");

    prevDate.setUTCDate(prevDate.getUTCDate() + 1);
    if (formatDateUTC(prevDate) === sortedDates[i]) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function formatDateUTC(date: Date): string {
  return date.toISOString().split("T")[0];
}

describe("calculateCurrentStreak", () => {
  it("returns 0 for empty set", () => {
    const completedSet = new Set<string>();
    const streak = calculateCurrentStreak(completedSet, "2024-03-15");
    expect(streak).toBe(0);
  });

  it("returns 1 for single day (today)", () => {
    const completedSet = new Set(["2024-03-15"]);
    const streak = calculateCurrentStreak(completedSet, "2024-03-15");
    expect(streak).toBe(1);
  });

  it("counts consecutive days correctly", () => {
    const completedSet = new Set([
      "2024-03-15",
      "2024-03-14",
      "2024-03-13",
      "2024-03-12",
    ]);
    const streak = calculateCurrentStreak(completedSet, "2024-03-15");
    expect(streak).toBe(4);
  });

  it("stops at gap", () => {
    const completedSet = new Set([
      "2024-03-15",
      "2024-03-14",
      // gap on 2024-03-13
      "2024-03-12",
      "2024-03-11",
    ]);
    const streak = calculateCurrentStreak(completedSet, "2024-03-15");
    expect(streak).toBe(2);
  });

  it("finds most recent streak if today not completed", () => {
    const completedSet = new Set([
      // 2024-03-15 not completed
      "2024-03-14",
      "2024-03-13",
      "2024-03-12",
    ]);
    const streak = calculateCurrentStreak(completedSet, "2024-03-15");
    expect(streak).toBe(3);
  });

  it("handles future dateLocal gracefully", () => {
    const completedSet = new Set(["2024-03-15", "2024-03-14"]);
    const streak = calculateCurrentStreak(completedSet, "2024-03-20");
    expect(streak).toBe(2); // Should find the most recent streak
  });
});

describe("calculateLongestStreak", () => {
  it("returns 0 for empty array", () => {
    const streak = calculateLongestStreak([]);
    expect(streak).toBe(0);
  });

  it("returns 1 for single day", () => {
    const streak = calculateLongestStreak(["2024-03-15"]);
    expect(streak).toBe(1);
  });

  it("calculates longest streak correctly", () => {
    const dates = [
      "2024-03-15",
      "2024-03-14",
      "2024-03-13", // 3-day streak
      // gap
      "2024-03-10",
      "2024-03-09",
      "2024-03-08",
      "2024-03-07",
      "2024-03-06", // 5-day streak (longest)
      // gap
      "2024-03-01",
      "2024-03-02", // 2-day streak
    ];
    const streak = calculateLongestStreak(dates);
    expect(streak).toBe(5);
  });

  it("handles non-sorted input", () => {
    const dates = ["2024-03-07", "2024-03-05", "2024-03-06"]; // Out of order
    const streak = calculateLongestStreak(dates);
    expect(streak).toBe(3);
  });

  it("handles gaps correctly", () => {
    const dates = [
      "2024-03-15",
      "2024-03-13", // 1-day gap
      "2024-03-11", // 1-day gap
    ];
    const streak = calculateLongestStreak(dates);
    expect(streak).toBe(1); // No consecutive days
  });
});

describe("Streak edge cases", () => {
  it("handles month boundaries", () => {
    const completedSet = new Set([
      "2024-03-01",
      "2024-02-29", // Leap year
      "2024-02-28",
    ]);
    const streak = calculateCurrentStreak(completedSet, "2024-03-01");
    expect(streak).toBe(3);
  });

  it("handles year boundaries", () => {
    const completedSet = new Set([
      "2024-01-01",
      "2023-12-31",
      "2023-12-30",
    ]);
    const streak = calculateCurrentStreak(completedSet, "2024-01-01");
    expect(streak).toBe(3);
  });

  it("longest streak across month boundary", () => {
    const dates = [
      "2024-03-01",
      "2024-02-29",
      "2024-02-28",
      "2024-02-27",
    ];
    const streak = calculateLongestStreak(dates);
    expect(streak).toBe(4);
  });
});
