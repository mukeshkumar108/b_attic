/**
 * Unit tests for prompt selection policy.
 */

import { describe, it, expect } from "vitest";
import {
  selectPromptForDate,
  pickAlternatePromptForSwap,
  getAllPrimaryTags,
} from "./promptPolicy";
import { PROMPTS, getPrimaryTag } from "./prompts";

describe("selectPromptForDate", () => {
  it("returns a prompt from the pool", () => {
    const prompt = selectPromptForDate({
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    expect(PROMPTS.some((p) => p.id === prompt.id)).toBe(true);
  });

  it("is deterministic - same inputs produce same output", () => {
    const ctx = {
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    };

    const prompt1 = selectPromptForDate(ctx);
    const prompt2 = selectPromptForDate(ctx);
    const prompt3 = selectPromptForDate(ctx);

    expect(prompt1.id).toBe(prompt2.id);
    expect(prompt2.id).toBe(prompt3.id);
  });

  it("different users get different prompts for same date", () => {
    const prompt1 = selectPromptForDate({
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    const prompt2 = selectPromptForDate({
      userId: "user-2",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    // Different users should likely get different prompts
    // (not guaranteed but statistically likely with 35 prompts)
    // This test verifies the hash includes userId
    expect(prompt1.id).not.toBe(prompt2.id);
  });

  it("same user gets different prompts on different dates", () => {
    const prompt1 = selectPromptForDate({
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    const prompt2 = selectPromptForDate({
      userId: "user-1",
      dateLocal: "2024-03-16",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    // Verifies the hash includes dateLocal
    expect(prompt1.id).not.toBe(prompt2.id);
  });

  it("avoids last 3 promptIds when possible", () => {
    const recentPromptIds = ["p01", "p02", "p03"];
    const results: string[] = [];

    // Run multiple times with different user/date combos
    for (let i = 0; i < 10; i++) {
      const prompt = selectPromptForDate({
        userId: `user-${i}`,
        dateLocal: "2024-03-15",
        recentHistoryTags: [],
        recentPromptIds,
      });
      results.push(prompt.id);
    }

    // None should be in the recent list
    expect(results.some((id) => recentPromptIds.includes(id))).toBe(false);
  });

  it("avoids tag that appeared 2 consecutive days", () => {
    // Same tag for 2 days should be avoided
    const recentHistoryTags = ["people", "people"];

    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const prompt = selectPromptForDate({
        userId: `user-${i}`,
        dateLocal: "2024-03-15",
        recentHistoryTags,
        recentPromptIds: [],
      });
      results.push(getPrimaryTag(prompt));
    }

    // None should be "people"
    expect(results.some((tag) => tag === "people")).toBe(false);
  });

  it("allows tag if only appeared once", () => {
    // Tag only appeared once, should not be avoided
    const recentHistoryTags = ["people", "moments"];

    let foundPeople = false;
    for (let i = 0; i < 50; i++) {
      const prompt = selectPromptForDate({
        userId: `test-user-${i}`,
        dateLocal: "2024-03-15",
        recentHistoryTags,
        recentPromptIds: [],
      });
      if (getPrimaryTag(prompt) === "people") {
        foundPeople = true;
        break;
      }
    }

    expect(foundPeople).toBe(true);
  });
});

describe("pickAlternatePromptForSwap", () => {
  it("returns a different prompt than current", () => {
    const alternate = pickAlternatePromptForSwap("p01", {
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    expect(alternate.id).not.toBe("p01");
  });

  it("is deterministic", () => {
    const ctx = {
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    };

    const alt1 = pickAlternatePromptForSwap("p01", ctx);
    const alt2 = pickAlternatePromptForSwap("p01", ctx);

    expect(alt1.id).toBe(alt2.id);
  });

  it("prefers different primary tag when possible", () => {
    // p01 has "people" tag
    const alternate = pickAlternatePromptForSwap("p01", {
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    });

    // Should prefer a different tag than "people"
    expect(getPrimaryTag(alternate)).not.toBe("people");
  });

  it("returns different result than selectPromptForDate", () => {
    const ctx = {
      userId: "user-1",
      dateLocal: "2024-03-15",
      recentHistoryTags: [],
      recentPromptIds: [],
    };

    const original = selectPromptForDate(ctx);
    const alternate = pickAlternatePromptForSwap(original.id, ctx);

    expect(alternate.id).not.toBe(original.id);
  });
});

describe("getAllPrimaryTags", () => {
  it("returns unique primary tags", () => {
    const tags = getAllPrimaryTags();

    expect(tags.length).toBeGreaterThan(0);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("includes expected categories", () => {
    const tags = getAllPrimaryTags();

    expect(tags).toContain("people");
    expect(tags).toContain("moments");
    expect(tags).toContain("self");
    expect(tags).toContain("nature");
    expect(tags).toContain("daily");
    expect(tags).toContain("growth");
    expect(tags).toContain("memory");
  });
});

describe("PROMPTS data", () => {
  it("has at least 30 prompts", () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(30);
  });

  it("all prompts have required fields", () => {
    for (const prompt of PROMPTS) {
      expect(prompt.id).toBeTruthy();
      expect(prompt.text).toBeTruthy();
      expect(prompt.tags.length).toBeGreaterThan(0);
    }
  });

  it("all prompt ids are unique", () => {
    const ids = PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
