import { fillTemplate, loadPromptMdStrict } from "@/lib/llm/openrouter";
import {
  getDefaultVoicePromptBinding,
  getFirstReflectionPromptBindingFromTrack,
} from "@/lib/voice/promptRegistry";
import type { VoiceConnectFlow } from "@/lib/voice/connectToken";

const IDENTITY_KERNEL_PATH = "src/lib/llm/prompts/voice_identity_kernel_v1.md";
const DEMO_MAIN_PATH = "src/lib/llm/prompts/voice_demo_main_v1.md";

/**
 * The existing Bluum flow prompt for a streaming session, unchanged. The Runtime receives it as
 * the product's character constitution; the phone never supplies instruction text.
 */
export function loadFlowConstitution(
  flow: VoiceConnectFlow,
  params: { displayName?: string | null } = {}
): string {
  switch (flow) {
    case "onboarding": {
      const binding = getDefaultVoicePromptBinding("ONBOARDING");
      return loadPromptMdStrict(binding!.templatePath);
    }
    case "first_reflection_day0":
      return loadPromptMdStrict(getFirstReflectionPromptBindingFromTrack("day0").templatePath);
    case "first_reflection_core":
      return loadPromptMdStrict(getFirstReflectionPromptBindingFromTrack("core").templatePath);
    case "voice_demo": {
      // The demo template is a per-turn prompt; fill the turn-specific slots empty for a session.
      const template = loadPromptMdStrict(DEMO_MAIN_PATH);
      return fillTemplate(template, {
        IDENTITY_KERNEL: loadPromptMdStrict(IDENTITY_KERNEL_PATH),
        MODE: "pre_activity",
        TRANSCRIPT: "",
        HISTORY: "",
        ACTIVITY_RESULT: "",
        NAME: params.displayName?.trim() || "",
      });
    }
  }
}
