import { describe, expect, it } from "vitest";
import {
  getDefaultVoicePromptBinding,
  getFirstReflectionPromptBindingFromTrack,
  resolveFirstReflectionPromptBinding,
  resolveOnboardingPromptBinding,
} from "@/lib/voice/promptRegistry";

describe("voice prompt registry", () => {
  it("returns default onboarding prompt binding", () => {
    const binding = getDefaultVoicePromptBinding("ONBOARDING");
    expect(binding).toEqual({
      key: "voice_onboarding_welcome",
      version: "v5",
      templatePath: "src/lib/llm/prompts/voice_onboarding_welcome_v5.md",
    });
  });

  it("returns default first_reflection prompt binding", () => {
    const binding = getDefaultVoicePromptBinding("FIRST_REFLECTION");
    expect(binding).toEqual({
      key: "voice_first_reflection_day0",
      version: "v1",
      templatePath: "src/lib/llm/prompts/voice_first_reflection_day0_v1.md",
    });
  });

  it("falls back to current onboarding prompt for legacy sessions", () => {
    const binding = resolveOnboardingPromptBinding({
      promptKey: null,
      promptVersion: null,
    });
    expect(binding.templatePath).toBe(
      "src/lib/llm/prompts/voice_onboarding_welcome_v5.md"
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

  it("falls back to current first_reflection prompt for legacy sessions", () => {
    const binding = resolveFirstReflectionPromptBinding({
      promptKey: null,
      promptVersion: null,
    });
    expect(binding.templatePath).toBe(
      "src/lib/llm/prompts/voice_first_reflection_day0_v1.md"
    );
  });

  it("resolves first_reflection core track binding", () => {
    const binding = getFirstReflectionPromptBindingFromTrack("core");
    expect(binding).toEqual({
      key: "voice_reflection_core",
      version: "v1",
      templatePath: "src/lib/llm/prompts/voice_reflection_core_v1.md",
    });
  });
});
