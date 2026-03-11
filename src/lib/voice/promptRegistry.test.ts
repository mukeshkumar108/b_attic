import { describe, expect, it } from "vitest";
import {
  getDefaultVoicePromptBinding,
  resolveOnboardingPromptBinding,
} from "@/lib/voice/promptRegistry";

describe("voice prompt registry", () => {
  it("returns default onboarding prompt binding", () => {
    const binding = getDefaultVoicePromptBinding("ONBOARDING");
    expect(binding).toEqual({
      key: "voice_onboarding_welcome",
      version: "v4",
      templatePath: "src/lib/llm/prompts/voice_onboarding_welcome_v4.md",
    });
  });

  it("returns null for first_reflection flow", () => {
    expect(getDefaultVoicePromptBinding("FIRST_REFLECTION")).toBeNull();
  });

  it("falls back to current onboarding prompt for legacy sessions", () => {
    const binding = resolveOnboardingPromptBinding({
      promptKey: null,
      promptVersion: null,
    });
    expect(binding.templatePath).toBe(
      "src/lib/llm/prompts/voice_onboarding_welcome_v4.md"
    );
  });

  it("throws for unknown onboarding prompt binding", () => {
    expect(() =>
      resolveOnboardingPromptBinding({
        promptKey: "voice_onboarding_welcome",
        promptVersion: "v99",
      })
    ).toThrow("Unsupported onboarding prompt binding");
  });
});
