import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFirstReflectionDay0ModelChain,
  getFirstReflectionDay1To3ModelChain,
  getOnboardingModelChain,
} from "@/lib/voice/modelRouting";

describe("voice model routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds onboarding chain with deduplicated fallback", () => {
    vi.stubEnv("OPENROUTER_ONBOARDING_MODEL", "anthropic/claude-sonnet-4.6");
    vi.stubEnv("OPENROUTER_REFLECTION_MODEL", "xiaomi/mimo-v2-flash");
    vi.stubEnv("OPENROUTER_MODEL", "xiaomi/mimo-v2-flash");

    expect(getOnboardingModelChain()).toEqual([
      "anthropic/claude-sonnet-4.6",
      "xiaomi/mimo-v2-flash",
    ]);
  });

  it("builds first reflection day0 chain with legacy support", () => {
    vi.stubEnv(
      "OPENROUTER_FIRST_REFLECTION_DAY0_MODEL",
      "anthropic/claude-sonnet-4.6"
    );
    vi.stubEnv("OPENROUTER_FIRST_REFLECTION_MODEL", "legacy/day0");
    vi.stubEnv("OPENROUTER_REFLECTION_MODEL", "xiaomi/mimo-v2-flash");
    vi.stubEnv("OPENROUTER_MODEL", "global/fallback");

    expect(getFirstReflectionDay0ModelChain()).toEqual([
      "anthropic/claude-sonnet-4.6",
      "legacy/day0",
      "xiaomi/mimo-v2-flash",
      "global/fallback",
    ]);
  });

  it("builds first reflection day1-3 chain", () => {
    vi.stubEnv(
      "OPENROUTER_FIRST_REFLECTION_DAY1_3_MODEL",
      "google/gemini-2.5-flash"
    );
    vi.stubEnv("OPENROUTER_REFLECTION_MODEL", "xiaomi/mimo-v2-flash");

    expect(getFirstReflectionDay1To3ModelChain()).toEqual([
      "google/gemini-2.5-flash",
      "xiaomi/mimo-v2-flash",
    ]);
  });

  it("prefers reflection ongoing model when set", () => {
    vi.stubEnv(
      "OPENROUTER_REFLECTION_ONGOING_MODEL",
      "google/gemini-2.5-flash"
    );
    vi.stubEnv(
      "OPENROUTER_FIRST_REFLECTION_DAY1_3_MODEL",
      "google/gemini-2.5-pro"
    );
    vi.stubEnv("OPENROUTER_REFLECTION_MODEL", "xiaomi/mimo-v2-flash");

    expect(getFirstReflectionDay1To3ModelChain()).toEqual([
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "xiaomi/mimo-v2-flash",
    ]);
  });
});
