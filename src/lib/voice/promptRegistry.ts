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

const ONBOARDING_WELCOME_V5: VoicePromptBinding = {
  key: "voice_onboarding_welcome",
  version: "v5",
  templatePath: "src/lib/llm/prompts/voice_onboarding_welcome_v5.md",
};

const FIRST_REFLECTION_DAY0_V1: VoicePromptBinding = {
  key: "voice_first_reflection_day0",
  version: "v1",
  templatePath: "src/lib/llm/prompts/voice_first_reflection_day0_v1.md",
};

const FIRST_REFLECTION_CORE_V1: VoicePromptBinding = {
  key: "voice_reflection_core",
  version: "v1",
  templatePath: "src/lib/llm/prompts/voice_reflection_core_v1.md",
};

const ONBOARDING_PROMPT_MAP: Record<string, VoicePromptBinding> = {
  [`${ONBOARDING_WELCOME_V5.key}:${ONBOARDING_WELCOME_V5.version}`]:
    ONBOARDING_WELCOME_V5,
  [`${ONBOARDING_WELCOME_V4.key}:${ONBOARDING_WELCOME_V4.version}`]:
    ONBOARDING_WELCOME_V4,
};

const FIRST_REFLECTION_PROMPT_MAP: Record<string, VoicePromptBinding> = {
  [`${FIRST_REFLECTION_DAY0_V1.key}:${FIRST_REFLECTION_DAY0_V1.version}`]:
    FIRST_REFLECTION_DAY0_V1,
  [`${FIRST_REFLECTION_CORE_V1.key}:${FIRST_REFLECTION_CORE_V1.version}`]:
    FIRST_REFLECTION_CORE_V1,
};

export function getDefaultVoicePromptBinding(
  flow: VoiceFlow
): VoicePromptBinding | null {
  if (flow === "ONBOARDING") {
    return ONBOARDING_WELCOME_V5;
  }
  if (flow === "FIRST_REFLECTION") {
    return FIRST_REFLECTION_DAY0_V1;
  }
  return null;
}

export function getFirstReflectionPromptBindingFromTrack(
  track: "day0" | "core" | null | undefined
): VoicePromptBinding {
  if (track === "core") {
    return FIRST_REFLECTION_CORE_V1;
  }
  return FIRST_REFLECTION_DAY0_V1;
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
    return ONBOARDING_WELCOME_V5;
  }

  const resolved = ONBOARDING_PROMPT_MAP[`${promptKey}:${promptVersion}`];
  if (!resolved) {
    throw new Error(
      `Unsupported onboarding prompt binding: ${promptKey}:${promptVersion}`
    );
  }

  return resolved;
}

/**
 * Resolve first_reflection prompt from session-locked key/version.
 * For legacy sessions without key/version, fall back to current default.
 */
export function resolveFirstReflectionPromptBinding(params: {
  promptKey: string | null;
  promptVersion: string | null;
}): VoicePromptBinding {
  const promptKey = params.promptKey?.trim() ?? "";
  const promptVersion = params.promptVersion?.trim() ?? "";

  if (!promptKey || !promptVersion) {
    return FIRST_REFLECTION_DAY0_V1;
  }

  const firstReflectionResolved =
    FIRST_REFLECTION_PROMPT_MAP[`${promptKey}:${promptVersion}`];
  if (!firstReflectionResolved) {
    throw new Error(
      `Unsupported first_reflection prompt binding: ${promptKey}:${promptVersion}`
    );
  }

  return firstReflectionResolved;
}
