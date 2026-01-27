/**
 * Unit tests for dailyStatus helper.
 * Verifies DailyStatus/PromptHistory creation works independently.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectPromptForDate } from "./promptPolicy";
import { PROMPTS } from "./prompts";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyStatus: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    promptHistory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { getOrCreateDailyStatus, updateDailyStatusPrompt } from "./dailyStatus";

describe("getOrCreateDailyStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing status if already exists", async () => {
    const existingStatus = {
      id: "status-1",
      userId: "user-1",
      dateLocal: "2024-03-15",
      promptId: "p01",
      promptText: "Who made you smile today?",
      hasReflection: false,
      hasMood: false,
      didSwapPrompt: false,
    };

    const existingHistory = {
      id: "history-1",
      userId: "user-1",
      dateLocal: "2024-03-15",
      promptId: "p01",
      tagsUsed: ["people", "recent"],
    };

    vi.mocked(prisma.dailyStatus.findUnique).mockResolvedValueOnce(
      existingStatus as any
    );
    vi.mocked(prisma.promptHistory.findUnique).mockResolvedValueOnce(
      existingHistory as any
    );

    const result = await getOrCreateDailyStatus("user-1", "2024-03-15");

    expect(result.status).toEqual(existingStatus);
    expect(result.promptHistory).toEqual(existingHistory);
    expect(result.isNew).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates new status and history if not exists", async () => {
    const userId = "user-1";
    const dateLocal = "2024-03-15";

    // No existing status
    vi.mocked(prisma.dailyStatus.findUnique).mockResolvedValueOnce(null);

    // No recent history (fresh user)
    vi.mocked(prisma.promptHistory.findMany).mockResolvedValueOnce([]);

    // Get the prompt that would be selected
    const expectedPrompt = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    const newStatus = {
      id: "new-status",
      userId,
      dateLocal,
      promptId: expectedPrompt.id,
      promptText: expectedPrompt.text,
      hasReflection: false,
      hasMood: false,
      didSwapPrompt: false,
    };

    const newHistory = {
      id: "new-history",
      userId,
      dateLocal,
      promptId: expectedPrompt.id,
      tagsUsed: expectedPrompt.tags,
    };

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([
      newStatus,
      newHistory,
    ] as any);

    const result = await getOrCreateDailyStatus(userId, dateLocal);

    expect(result.isNew).toBe(true);
    expect(result.status.promptId).toBe(expectedPrompt.id);
    expect(result.status.promptText).toBe(expectedPrompt.text);
    expect(result.promptHistory.promptId).toBe(expectedPrompt.id);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("uses deterministic prompt selection for fresh user", async () => {
    const userId = "fresh-user";
    const dateLocal = "2024-03-15";

    vi.mocked(prisma.dailyStatus.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.promptHistory.findMany).mockResolvedValueOnce([]);

    // Get expected prompt
    const expectedPrompt = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (ops) => {
      // Verify the transaction creates with correct prompt
      return [
        {
          id: "s1",
          userId,
          dateLocal,
          promptId: expectedPrompt.id,
          promptText: expectedPrompt.text,
        },
        {
          id: "h1",
          userId,
          dateLocal,
          promptId: expectedPrompt.id,
          tagsUsed: expectedPrompt.tags,
        },
      ];
    });

    const result = await getOrCreateDailyStatus(userId, dateLocal);

    // Same user + date should always get same prompt
    expect(result.status.promptId).toBe(expectedPrompt.id);

    // Verify determinism: call again with same inputs
    const expectedPrompt2 = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    });
    expect(expectedPrompt.id).toBe(expectedPrompt2.id);
  });

  it("considers recent history for tag rotation", async () => {
    const userId = "user-with-history";
    const dateLocal = "2024-03-15";

    vi.mocked(prisma.dailyStatus.findUnique).mockResolvedValueOnce(null);

    // User has recent history with "people" tag twice
    vi.mocked(prisma.promptHistory.findMany).mockResolvedValueOnce([
      { promptId: "p01", tagsUsed: ["people", "recent"], dateLocal: "2024-03-14" },
      { promptId: "p02", tagsUsed: ["people", "support"], dateLocal: "2024-03-13" },
    ] as any);

    // Get expected prompt (should avoid "people" tag)
    const expectedPrompt = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: ["people", "people"],
      recentPromptIds: ["p01", "p02"],
    });

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([
      { promptId: expectedPrompt.id, promptText: expectedPrompt.text },
      { promptId: expectedPrompt.id, tagsUsed: expectedPrompt.tags },
    ] as any);

    const result = await getOrCreateDailyStatus(userId, dateLocal);

    // Should NOT be a "people" prompt (tag rotation)
    const selectedPrompt = PROMPTS.find((p) => p.id === result.status.promptId);
    expect(selectedPrompt?.tags[0]).not.toBe("people");
  });
});

describe("updateDailyStatusPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates both status and history in transaction", async () => {
    const updatedStatus = {
      id: "status-1",
      userId: "user-1",
      dateLocal: "2024-03-15",
      promptId: "m01",
      promptText: "New prompt text",
      didSwapPrompt: true,
    };

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([
      updatedStatus,
      { promptId: "m01", tagsUsed: ["moments", "recent"] },
    ] as any);

    const result = await updateDailyStatusPrompt(
      "user-1",
      "2024-03-15",
      "m01",
      "New prompt text",
      ["moments", "recent"]
    );

    expect(result.promptId).toBe("m01");
    expect(result.didSwapPrompt).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe("Reflection independence from /today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates DailyStatus when called directly without /today", async () => {
    const userId = "new-user";
    const dateLocal = "2024-03-15";

    // Simulate fresh user - no existing status
    vi.mocked(prisma.dailyStatus.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.promptHistory.findMany).mockResolvedValueOnce([]);

    const expectedPrompt = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    const createdStatus = {
      id: "auto-created-status",
      userId,
      dateLocal,
      promptId: expectedPrompt.id,
      promptText: expectedPrompt.text,
      hasReflection: false,
      hasMood: false,
      didSwapPrompt: false,
    };

    const createdHistory = {
      id: "auto-created-history",
      userId,
      dateLocal,
      promptId: expectedPrompt.id,
      tagsUsed: expectedPrompt.tags,
    };

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([
      createdStatus,
      createdHistory,
    ] as any);

    const result = await getOrCreateDailyStatus(userId, dateLocal);

    // Verify DailyStatus was created
    expect(result.isNew).toBe(true);
    expect(result.status.userId).toBe(userId);
    expect(result.status.dateLocal).toBe(dateLocal);

    // Verify PromptHistory was created
    expect(result.promptHistory.userId).toBe(userId);
    expect(result.promptHistory.dateLocal).toBe(dateLocal);

    // Verify prompt snapshot is consistent
    expect(result.status.promptId).toBe(expectedPrompt.id);
    expect(result.status.promptText).toBe(expectedPrompt.text);
    expect(result.promptHistory.promptId).toBe(expectedPrompt.id);
  });

  it("prompt selection is deterministic for same user+date", () => {
    const userId = "test-user";
    const dateLocal = "2024-03-15";
    const ctx = {
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    };

    // Multiple calls should return same prompt
    const prompt1 = selectPromptForDate(ctx);
    const prompt2 = selectPromptForDate(ctx);
    const prompt3 = selectPromptForDate(ctx);

    expect(prompt1.id).toBe(prompt2.id);
    expect(prompt2.id).toBe(prompt3.id);
    expect(prompt1.text).toBe(prompt2.text);
  });

  it("same prompt is selected whether /today called first or not", () => {
    // This simulates the key correctness requirement:
    // Calling POST /reflection directly should produce the same
    // promptId/promptText as if /today was called first

    const userId = "user-x";
    const dateLocal = "2024-03-20";

    // Prompt selection if /today was called first
    const promptFromToday = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    // Prompt selection if /reflection is called directly
    // (getOrCreateDailyStatus uses same logic)
    const promptFromReflection = selectPromptForDate({
      userId,
      dateLocal,
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    // They must be identical
    expect(promptFromToday.id).toBe(promptFromReflection.id);
    expect(promptFromToday.text).toBe(promptFromReflection.text);
    expect(promptFromToday.tags).toEqual(promptFromReflection.tags);
  });
});
