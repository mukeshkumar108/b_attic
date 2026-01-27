/**
 * Unit tests for coaching module.
 * Tests safety gate and rubric coach with mocked LLM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runSafetyGate,
  runRubricCoach,
  getSafetyResponse,
  SafetyGateResultSchema,
  CoachResultSchema,
} from "./coaching";
import * as openrouter from "@/lib/llm/openrouter";

// Mock the openrouter module
vi.mock("@/lib/llm/openrouter", () => ({
  loadPromptMd: vi.fn(() => "mock template {{PROMPT}} {{RESPONSE}}"),
  fillTemplate: vi.fn((template, vars) => `filled: ${vars.PROMPT} | ${vars.RESPONSE}`),
  callOpenRouter: vi.fn(),
  parseJsonWithZod: vi.fn(),
  callLLMWithTemplate: vi.fn(),
}));

describe("Safety Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns flagged=true for self-harm content", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce({
      flagged: true,
      reason: "self_harm",
    });

    const result = await runSafetyGate({
      promptText: "What are you grateful for?",
      responseText: "honestly just want to kms today nothing matters",
    });

    expect(result.flagged).toBe(true);
    expect(result.reason).toBe("self_harm");
  });

  it("returns flagged=false for normal content", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce({
      flagged: false,
      reason: "none",
    });

    const result = await runSafetyGate({
      promptText: "What are you grateful for?",
      responseText: "I'm grateful for my morning coffee",
    });

    expect(result.flagged).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("returns safe fallback when LLM fails", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockRejectedValueOnce(
      new Error("API error")
    );

    const result = await runSafetyGate({
      promptText: "What are you grateful for?",
      responseText: "test response",
    });

    // Fallback should NOT flag (avoid false positives)
    expect(result.flagged).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("returns safe fallback when LLM returns null", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce(null);

    const result = await runSafetyGate({
      promptText: "test",
      responseText: "test",
    });

    expect(result.flagged).toBe(false);
    expect(result.reason).toBe("none");
  });
});

describe("Rubric Coach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns VALIDATE for high quality reflection", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce({
      scores: { specificity: 2, meaning: 2, emotion: 2 },
      coachType: "VALIDATE",
      coachText: "Being seen when you need it most is a real gift.",
    });

    const result = await runRubricCoach({
      promptText: "Who made you smile today?",
      responseText:
        "My coworker Sarah noticed I was stressed and brought me tea.",
    });

    expect(result.coachType).toBe("VALIDATE");
    expect(result.scores.specificity).toBe(2);
    expect(result.coachText.length).toBeLessThanOrEqual(180);
  });

  it("returns NUDGE for low quality reflection", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce({
      scores: { specificity: 0, meaning: 0, emotion: 0 },
      coachType: "NUDGE",
      coachText: "What was it about that coffee that made it stand out today?",
    });

    const result = await runRubricCoach({
      promptText: "What small moment brought you joy?",
      responseText: "My morning coffee",
    });

    expect(result.coachType).toBe("NUDGE");
    expect(result.scores.specificity).toBe(0);
  });

  it("truncates coachText if over 180 chars", async () => {
    const longText = "A".repeat(200);
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce({
      scores: { specificity: 1, meaning: 1, emotion: 1 },
      coachType: "VALIDATE",
      coachText: longText,
    });

    const result = await runRubricCoach({
      promptText: "test",
      responseText: "test",
    });

    expect(result.coachText.length).toBeLessThanOrEqual(180);
    expect(result.coachText.endsWith("...")).toBe(true);
  });

  it("returns fallback when LLM fails", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockRejectedValueOnce(
      new Error("API error")
    );

    const result = await runRubricCoach({
      promptText: "test",
      responseText: "test",
    });

    expect(result.coachType).toBe("VALIDATE");
    expect(result.coachText).toBe(
      "Thanks for taking a moment to reflect today."
    );
  });

  it("returns fallback when LLM returns null", async () => {
    vi.mocked(openrouter.callLLMWithTemplate).mockResolvedValueOnce(null);

    const result = await runRubricCoach({
      promptText: "test",
      responseText: "test",
    });

    expect(result.coachType).toBe("VALIDATE");
    expect(result.scores).toEqual({ specificity: 1, meaning: 1, emotion: 1 });
  });
});

describe("Safety Response", () => {
  it("includes crisis resources", () => {
    const response = getSafetyResponse();

    expect(response.message).toBeTruthy();
    expect(response.resources.length).toBeGreaterThan(0);

    // Should include US 988
    const us988 = response.resources.find((r) => r.value.includes("988"));
    expect(us988).toBeTruthy();

    // Should include UK Samaritans
    const uk = response.resources.find((r) => r.value.includes("116 123"));
    expect(uk).toBeTruthy();
  });
});

describe("Zod Schemas", () => {
  it("SafetyGateResultSchema validates correct input", () => {
    const valid = { flagged: true, reason: "self_harm" };
    const result = SafetyGateResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("SafetyGateResultSchema rejects invalid reason", () => {
    const invalid = { flagged: true, reason: "invalid" };
    const result = SafetyGateResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("CoachResultSchema validates correct input", () => {
    const valid = {
      scores: { specificity: 2, meaning: 1, emotion: 0 },
      coachType: "NUDGE",
      coachText: "What made it special?",
    };
    const result = CoachResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("CoachResultSchema rejects invalid scores", () => {
    const invalid = {
      scores: { specificity: 5, meaning: 1, emotion: 0 },
      coachType: "NUDGE",
      coachText: "test",
    };
    const result = CoachResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
