import type { VoiceFlow } from "@prisma/client";

export interface VoicePromptBinding {
  key: string;
  version: string;
  templatePath: string;
}

const ONBOARDING_WELCOME_V4: VoicePromptBinding = {
  key: "voice_onboarding_welcome",
  version: "v4",
  templatePath: "src/lib/llm/prompts/voice_onboarding_welcome_v4.md",
};

const ONBOARDING_PROMPT_MAP: Record<string, VoicePromptBinding> = {
  [`${ONBOARDING_WELCOME_V4.key}:${ONBOARDING_WELCOME_V4.version}`]:
    ONBOARDING_WELCOME_V4,
};

export function getDefaultVoicePromptBinding(
  flow: VoiceFlow
): VoicePromptBinding | null {
  if (flow === "ONBOARDING") {
    return ONBOARDING_WELCOME_V4;
  }
  return null;
}

/**
 * Resolve onboarding prompt from session-locked key/version.
 * For legacy sessions without key/version, fall back to current default.
 */
export function resolveOnboardingPromptBinding(params: {
  promptKey: string | null;
  promptVersion: string | null;
}): VoicePromptBinding {
  const promptKey = params.promptKey?.trim() ?? "";
  const promptVersion = params.promptVersion?.trim() ?? "";

  if (!promptKey || !promptVersion) {
    return ONBOARDING_WELCOME_V4;
  }

  const resolved = ONBOARDING_PROMPT_MAP[`${promptKey}:${promptVersion}`];
  if (!resolved) {
    throw new Error(
      `Unsupported onboarding prompt binding: ${promptKey}:${promptVersion}`
    );
  }

  return resolved;
}
