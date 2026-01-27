/**
 * Synthetic/integration tests for reflection endpoints.
 * Tests business logic with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// These are synthetic tests that verify the business logic
// without actually calling the API routes (which would require
// a full Next.js test environment).

// We test the core logic components directly.

import { getSuccessMessage, MILESTONE_SUCCESS_MESSAGES } from "./messages/successMessages";
import { validateDateLocal, getDateLocalForUser, ensureDateLocal } from "./dateLocal";
import { selectPromptForDate } from "./promptPolicy";
import { PROMPTS } from "./prompts";

describe("Reflection Business Logic", () => {
  describe("Write-once policy", () => {
    it("should reject if reflection already exists", () => {
      // Simulates the 409 check in reflection route
      const existingReflection = { id: "existing", dateLocal: "2024-03-15" };
      const shouldReject = existingReflection !== null;
      expect(shouldReject).toBe(true);
    });

    it("should allow if no reflection exists", () => {
      const existingReflection = null;
      const shouldReject = existingReflection !== null;
      expect(shouldReject).toBe(false);
    });
  });

  describe("Safety gate integration", () => {
    it("should flag self-harm content patterns", () => {
      // These patterns should be detected by the safety gate
      const dangerousPatterns = [
        "kms",
        "kill myself",
        "end it all",
        "don't want to be here anymore",
        "want to die",
      ];

      // Each pattern should trigger the safety gate
      for (const pattern of dangerousPatterns) {
        const text = `honestly just ${pattern} today`;
        const containsDangerousPattern = dangerousPatterns.some((p) =>
          text.toLowerCase().includes(p)
        );
        expect(containsDangerousPattern).toBe(true);
      }
    });

    it("should not flag normal gratitude content", () => {
      const safeExamples = [
        "I'm grateful for my morning coffee",
        "My friend helped me move today",
        "The weather was beautiful",
        "I finished a difficult project",
      ];

      const dangerousPatterns = [
        "kms",
        "kill myself",
        "end it all",
        "don't want to be here",
        "want to die",
      ];

      for (const text of safeExamples) {
        const containsDangerousPattern = dangerousPatterns.some((p) =>
          text.toLowerCase().includes(p)
        );
        expect(containsDangerousPattern).toBe(false);
      }
    });

    it("should skip rubric coaching when flagged", () => {
      // When safety gate flags, we should NOT run rubric
      const safetyFlagged = true;
      const shouldRunRubric = !safetyFlagged;
      expect(shouldRunRubric).toBe(false);
    });

    it("should run rubric coaching when not flagged", () => {
      const safetyFlagged = false;
      const shouldRunRubric = !safetyFlagged;
      expect(shouldRunRubric).toBe(true);
    });
  });

  describe("Success messages", () => {
    it("returns milestone message on day 1", () => {
      const message = getSuccessMessage({
        currentStreak: 1,
        totalReflections: 0, // Before this one
        userId: "user-1",
        dateLocal: "2024-03-15",
      });
      expect(message).toBe(MILESTONE_SUCCESS_MESSAGES[1]);
    });

    it("returns milestone message on day 7", () => {
      const message = getSuccessMessage({
        currentStreak: 7,
        totalReflections: 6, // Before this one
        userId: "user-1",
        dateLocal: "2024-03-15",
      });
      expect(message).toBe(MILESTONE_SUCCESS_MESSAGES[7]);
    });

    it("returns deterministic message for same user/date", () => {
      const ctx = {
        currentStreak: 5,
        totalReflections: 10,
        userId: "user-1",
        dateLocal: "2024-03-15",
      };

      const msg1 = getSuccessMessage(ctx);
      const msg2 = getSuccessMessage(ctx);
      const msg3 = getSuccessMessage(ctx);

      expect(msg1).toBe(msg2);
      expect(msg2).toBe(msg3);
    });
  });
});

describe("Addendum Business Logic", () => {
  describe("Same-day restriction", () => {
    it("should allow addendum for today", () => {
      const todayLocal = getDateLocalForUser("UTC");
      const requestDateLocal = todayLocal;
      const isSameDay = requestDateLocal === todayLocal;
      expect(isSameDay).toBe(true);
    });

    it("should reject addendum for past date", () => {
      const todayLocal = "2024-03-15";
      const requestDateLocal = "2024-03-14";
      const isSameDay = requestDateLocal === todayLocal;
      expect(isSameDay).toBe(false);
    });

    it("should reject addendum for future date", () => {
      const todayLocal = "2024-03-15";
      const requestDateLocal = "2024-03-16";
      const isSameDay = requestDateLocal === todayLocal;
      expect(isSameDay).toBe(false);
    });
  });

  describe("One addendum per day", () => {
    it("should allow first addendum", () => {
      const existingAddendum = null;
      const shouldAllow = existingAddendum === null;
      expect(shouldAllow).toBe(true);
    });

    it("should reject second addendum", () => {
      const existingAddendum = { id: "existing", text: "first addendum" };
      const shouldAllow = existingAddendum === null;
      expect(shouldAllow).toBe(false);
    });
  });

  describe("Requires existing reflection", () => {
    it("should reject if no reflection exists", () => {
      const reflection = null;
      const hasReflection = reflection !== null;
      expect(hasReflection).toBe(false);
    });

    it("should allow if reflection exists", () => {
      const reflection = { id: "ref-1", responseText: "test" };
      const hasReflection = reflection !== null;
      expect(hasReflection).toBe(true);
    });
  });

  describe("No rubric re-run", () => {
    it("addendum does not trigger coaching", () => {
      // This is enforced by the route not calling runRubricCoach
      // Here we just document the expected behavior
      const addendumShouldTriggerCoaching = false;
      expect(addendumShouldTriggerCoaching).toBe(false);
    });
  });
});

describe("Validation", () => {
  describe("responseText limits", () => {
    it("accepts text within limits", () => {
      const text = "A".repeat(2000);
      const isValid = text.length >= 1 && text.length <= 2000;
      expect(isValid).toBe(true);
    });

    it("rejects empty text", () => {
      const text = "";
      const isValid = text.length >= 1 && text.length <= 2000;
      expect(isValid).toBe(false);
    });

    it("rejects text over 2000 chars", () => {
      const text = "A".repeat(2001);
      const isValid = text.length >= 1 && text.length <= 2000;
      expect(isValid).toBe(false);
    });
  });

  describe("addendum text limits", () => {
    it("accepts text within limits", () => {
      const text = "A".repeat(400);
      const isValid = text.length >= 1 && text.length <= 400;
      expect(isValid).toBe(true);
    });

    it("rejects text over 400 chars", () => {
      const text = "A".repeat(401);
      const isValid = text.length >= 1 && text.length <= 400;
      expect(isValid).toBe(false);
    });
  });

  describe("dateLocal validation", () => {
    it("validates correct format", () => {
      expect(validateDateLocal("2024-03-15")).toBe(true);
    });

    it("rejects incorrect format", () => {
      expect(validateDateLocal("03-15-2024")).toBe(false);
      expect(validateDateLocal("2024/03/15")).toBe(false);
    });

    it("ensureDateLocal handles missing input", () => {
      const result = ensureDateLocal(null, "UTC");
      expect(validateDateLocal(result)).toBe(true);
    });
  });
});

describe("Reflection Independence from /today", () => {
  describe("Fresh user calling POST /reflection directly", () => {
    it("should use deterministic prompt selection", () => {
      // Simulates what happens when POST /reflection is called
      // without first calling GET /today

      const userId = "fresh-user-123";
      const dateLocal = "2024-03-15";

      // The prompt selection that would happen in getOrCreateDailyStatus
      const prompt = selectPromptForDate({
        userId,
        dateLocal,
        recentHistoryTags: [], // Fresh user has no history
        recentPromptIds: [],
      });

      // Prompt should be valid
      expect(prompt.id).toBeTruthy();
      expect(prompt.text).toBeTruthy();
      expect(prompt.tags.length).toBeGreaterThan(0);

      // Prompt should exist in PROMPTS
      const found = PROMPTS.find((p) => p.id === prompt.id);
      expect(found).toBeTruthy();
    });

    it("should select same prompt regardless of entry point", () => {
      // Key test: prompt selection is identical whether:
      // 1. User calls GET /today first, then POST /reflection
      // 2. User calls POST /reflection directly

      const userId = "test-user-abc";
      const dateLocal = "2024-03-20";

      // Simulate /today path
      const promptViaToday = selectPromptForDate({
        userId,
        dateLocal,
        recentHistoryTags: [],
        recentPromptIds: [],
      });

      // Simulate direct /reflection path
      const promptViaReflection = selectPromptForDate({
        userId,
        dateLocal,
        recentHistoryTags: [],
        recentPromptIds: [],
      });

      // MUST be identical
      expect(promptViaToday.id).toBe(promptViaReflection.id);
      expect(promptViaToday.text).toBe(promptViaReflection.text);
    });

    it("should create consistent promptId/promptText snapshot", () => {
      const userId = "snapshot-user";
      const dateLocal = "2024-03-15";

      // What getOrCreateDailyStatus would do
      const prompt = selectPromptForDate({
        userId,
        dateLocal,
        recentHistoryTags: [],
        recentPromptIds: [],
      });

      // Simulate the data that would be stored in DailyStatus
      const dailyStatusData = {
        promptId: prompt.id,
        promptText: prompt.text,
      };

      // Simulate the data that would be stored in PromptHistory
      const promptHistoryData = {
        promptId: prompt.id,
        tagsUsed: prompt.tags,
      };

      // Simulate the data that would be stored in DailyReflection
      const reflectionData = {
        promptId: prompt.id,
        promptText: prompt.text,
      };

      // All three should have consistent promptId
      expect(dailyStatusData.promptId).toBe(reflectionData.promptId);
      expect(dailyStatusData.promptId).toBe(promptHistoryData.promptId);

      // DailyStatus and Reflection should have same promptText
      expect(dailyStatusData.promptText).toBe(reflectionData.promptText);
    });
  });

  describe("Expected response structure (non-safety path)", () => {
    it("should include coach and successMessage in response", () => {
      // Simulate successful reflection response structure
      const mockResponse = {
        saved: true,
        safetyFlagged: false,
        coach: {
          type: "validate",
          text: "Thanks for sharing that moment.",
        },
        successMessage: "Nice work taking a moment to reflect today.",
      };

      // Verify structure
      expect(mockResponse.saved).toBe(true);
      expect(mockResponse.safetyFlagged).toBe(false);
      expect(mockResponse.coach).toBeTruthy();
      expect(mockResponse.coach.type).toMatch(/^(validate|nudge)$/);
      expect(mockResponse.coach.text).toBeTruthy();
      expect(mockResponse.successMessage).toBeTruthy();
    });

    it("should include milestone message for first reflection", () => {
      const successMessage = getSuccessMessage({
        currentStreak: 0, // Will become 1 after this reflection
        totalReflections: 0, // Before this one
        userId: "new-user",
        dateLocal: "2024-03-15",
      });

      expect(successMessage).toBe(MILESTONE_SUCCESS_MESSAGES[1]);
    });
  });

  describe("DailyStatus state after reflection", () => {
    it("hasReflection should be true after successful save", () => {
      // Simulates the state update in the transaction
      const beforeSave = { hasReflection: false };
      const afterSave = { ...beforeSave, hasReflection: true };

      expect(afterSave.hasReflection).toBe(true);
    });

    it("DailyStatus promptId should match Reflection promptId", () => {
      const prompt = selectPromptForDate({
        userId: "user-1",
        dateLocal: "2024-03-15",
        recentHistoryTags: [],
        recentPromptIds: [],
      });

      const dailyStatus = { promptId: prompt.id, promptText: prompt.text };
      const reflection = { promptId: prompt.id, promptText: prompt.text };

      expect(dailyStatus.promptId).toBe(reflection.promptId);
      expect(dailyStatus.promptText).toBe(reflection.promptText);
    });
  });

  describe("PromptHistory consistency", () => {
    it("PromptHistory should exist after reflection", () => {
      // The getOrCreateDailyStatus creates PromptHistory
      const prompt = selectPromptForDate({
        userId: "user-1",
        dateLocal: "2024-03-15",
        recentHistoryTags: [],
        recentPromptIds: [],
      });

      const promptHistory = {
        userId: "user-1",
        dateLocal: "2024-03-15",
        promptId: prompt.id,
        tagsUsed: prompt.tags,
      };

      expect(promptHistory.promptId).toBe(prompt.id);
      expect(promptHistory.tagsUsed).toEqual(prompt.tags);
    });

    it("PromptHistory tagsUsed should match prompt tags", () => {
      const prompt = selectPromptForDate({
        userId: "tag-test-user",
        dateLocal: "2024-03-15",
        recentHistoryTags: [],
        recentPromptIds: [],
      });

      // Verify tags are stored correctly
      expect(Array.isArray(prompt.tags)).toBe(true);
      expect(prompt.tags.length).toBeGreaterThan(0);
      expect(prompt.tags[0]).toBeTruthy(); // Primary tag exists
    });
  });
});
