import {
  callOpenRouterWithModelFallback,
  fillTemplate,
  loadPromptMdStrict,
  parseJsonWithZod,
} from "@/lib/llm/openrouter";
import { z } from "zod";
import { getFirstReflectionDay1To3ModelChain } from "@/lib/voice/modelRouting";

export const VOICE_DEMO_HANDSHAKE_TEXT =
  "Welcome to the voice demo. I'll give you a feel for how a session can flow, including a quick guided reset in the middle. To start, tell me what usually helps you settle in when you're trying something new.";

const VOICE_IDENTITY_KERNEL_PATH =
  "src/lib/llm/prompts/voice_identity_kernel_v1.md";
const VOICE_INTERVENTION_KERNEL_PATH =
  "src/lib/llm/prompts/voice_intervention_kernel_v1.md";
const VOICE_DEMO_MAIN_PROMPT_PATH =
  "src/lib/llm/prompts/voice_demo_main_v1.md";
const VOICE_INTERVENTION_OFFER_PROMPT_PATH =
  "src/lib/llm/prompts/voice_intervention_offer_resolution_v1.md";
const VOICE_INTERVENTION_DISMISS_PROMPT_PATH =
  "src/lib/llm/prompts/voice_intervention_dismiss_resolution_v1.md";

function loadVoiceIdentityKernel(): string {
  return loadPromptMdStrict(VOICE_IDENTITY_KERNEL_PATH);
}

function loadVoiceInterventionKernel(): string {
  return loadPromptMdStrict(VOICE_INTERVENTION_KERNEL_PATH);
}

function buildVoiceDemoMainPrompt(params: {
  mode: "pre_activity" | "post_activity" | "closing";
  transcript: string;
  history: string;
  activityResult: string;
  name: string;
}): string {
  const template = loadPromptMdStrict(VOICE_DEMO_MAIN_PROMPT_PATH);
  return fillTemplate(template, {
    IDENTITY_KERNEL: loadVoiceIdentityKernel(),
    MODE: params.mode,
    TRANSCRIPT: params.transcript,
    HISTORY: params.history,
    ACTIVITY_RESULT: params.activityResult,
    NAME: params.name,
  });
}

function buildOfferResolutionPrompt(params: {
  transcript: string;
  history: string;
  name: string;
  activityType: string;
  activityTitle: string;
  activityDescription: string;
}): string {
  const template = loadPromptMdStrict(VOICE_INTERVENTION_OFFER_PROMPT_PATH);
  return fillTemplate(template, {
    IDENTITY_KERNEL: loadVoiceIdentityKernel(),
    INTERVENTION_KERNEL: loadVoiceInterventionKernel(),
    TRANSCRIPT: params.transcript,
    HISTORY: params.history,
    NAME: params.name,
    ACTIVITY_TYPE: params.activityType,
    ACTIVITY_TITLE: params.activityTitle,
    ACTIVITY_DESCRIPTION: params.activityDescription,
  });
}

function buildDismissResolutionPrompt(params: {
  transcript: string;
  history: string;
  name: string;
  activityType: string;
  activityTitle: string;
  activityDescription: string;
}): string {
  const template = loadPromptMdStrict(VOICE_INTERVENTION_DISMISS_PROMPT_PATH);
  return fillTemplate(template, {
    IDENTITY_KERNEL: loadVoiceIdentityKernel(),
    INTERVENTION_KERNEL: loadVoiceInterventionKernel(),
    TRANSCRIPT: params.transcript,
    HISTORY: params.history,
    NAME: params.name,
    ACTIVITY_TYPE: params.activityType,
    ACTIVITY_TITLE: params.activityTitle,
    ACTIVITY_DESCRIPTION: params.activityDescription,
  });
}

const VoiceDemoOfferResolutionSchema = z.object({
  intent: z.enum(["accept", "decline", "clarify"]),
  reply: z.string(),
});

const VoiceDemoDismissResolutionSchema = z.object({
  intent: z.enum(["retry_activity", "continue_session", "clarify"]),
  reply: z.string(),
});

function formatConversationHistory(
  history: Array<{ userTranscript: string; assistantText: string }>
): string {
  if (!history.length) {
    return "None yet.";
  }

  return history
    .map(
      (turn, idx) =>
        `Turn ${idx + 1}:\nAssistant: ${turn.assistantText}\nUser: ${turn.userTranscript}`
    )
    .join("\n\n");
}

function sanitizeReplyForSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function runVoiceDemoTurn(params: {
  mode: "pre_activity" | "post_activity" | "closing";
  transcript: string;
  history?: Array<{ userTranscript: string; assistantText: string }>;
  activityResultSummary?: string | null;
  profile?: {
    name?: string | null;
  };
}): Promise<string> {
  const history = params.history ?? [];
  const prompt = buildVoiceDemoMainPrompt({
    mode: params.mode,
    transcript: params.transcript,
    history: formatConversationHistory(history),
    activityResult: params.activityResultSummary ?? "none yet",
    name: params.profile?.name || "unknown",
  });

  try {
    const raw = await callOpenRouterWithModelFallback(prompt, {
      modelChain: getFirstReflectionDay1To3ModelChain(),
      contextLabel: "voice_demo",
      temperature: 0.5,
      maxTokens: 220,
    });
    const cleaned = sanitizeReplyForSpeech(raw);
    if (cleaned) {
      return cleaned;
    }
  } catch {
    // Fall through to deterministic fallback copy.
  }

  if (params.mode === "pre_activity") {
    return "That makes sense. The nice thing here is we can keep talking, pause for a quick reset, and then come straight back. Want to try a short breathing exercise first?";
  }
  if (params.mode === "post_activity") {
    return "Nice. That is exactly how a short reset can slot into the conversation. What did you notice in yourself while you were doing it?";
  }
  return "That is the shape of it. You can have a real conversation, pause for a guided moment, and then keep going without losing the thread.";
}

export async function resolveVoiceDemoOfferTurn(params: {
  transcript: string;
  history?: Array<{ userTranscript: string; assistantText: string }>;
  profile?: {
    name?: string | null;
  };
}): Promise<z.infer<typeof VoiceDemoOfferResolutionSchema>> {
  const history = params.history ?? [];
  const prompt = buildOfferResolutionPrompt({
    transcript: params.transcript,
    history: formatConversationHistory(history),
    name: params.profile?.name || "unknown",
    activityType: "breathing",
    activityTitle: "4-7-8 Breathing",
    activityDescription: "A short guided breathing reset, about two minutes, then back into the conversation.",
  });

  try {
    const raw = await callOpenRouterWithModelFallback(prompt, {
      modelChain: getFirstReflectionDay1To3ModelChain(),
      contextLabel: "voice_demo_offer_resolution",
      temperature: 0.2,
      maxTokens: 180,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match
      ? parseJsonWithZod(match[0], VoiceDemoOfferResolutionSchema)
      : parseJsonWithZod(raw, VoiceDemoOfferResolutionSchema);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to heuristics.
  }

  const text = params.transcript.toLowerCase();
  if (/\b(yes|yeah|yep|okay|ok|sure|let's do it|lets do it|sounds good)\b/.test(text)) {
    return {
      intent: "accept",
      reply: "Perfect. I've got it ready. Start it whenever you want.",
    };
  }
  if (/\b(no|nah|not now|keep going|continue|skip|don't want|dont want)\b/.test(text)) {
    return {
      intent: "decline",
      reply: "No problem. We can keep the demo moving and stay in conversation.",
    };
  }
  return {
    intent: "clarify",
    reply: "It is a short guided breathing reset, about two minutes, and then we come straight back here. Want to try it?",
  };
}

export async function resolveVoiceDemoDismissTurn(params: {
  transcript: string;
  history?: Array<{ userTranscript: string; assistantText: string }>;
  profile?: {
    name?: string | null;
  };
}): Promise<z.infer<typeof VoiceDemoDismissResolutionSchema>> {
  const history = params.history ?? [];
  const prompt = buildDismissResolutionPrompt({
    transcript: params.transcript,
    history: formatConversationHistory(history),
    name: params.profile?.name || "unknown",
    activityType: "breathing",
    activityTitle: "4-7-8 Breathing",
    activityDescription: "A short guided breathing reset, about two minutes, then back into the conversation.",
  });

  try {
    const raw = await callOpenRouterWithModelFallback(prompt, {
      modelChain: getFirstReflectionDay1To3ModelChain(),
      contextLabel: "voice_demo_dismiss_resolution",
      temperature: 0.2,
      maxTokens: 180,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match
      ? parseJsonWithZod(match[0], VoiceDemoDismissResolutionSchema)
      : parseJsonWithZod(raw, VoiceDemoDismissResolutionSchema);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to heuristics.
  }

  const text = params.transcript.toLowerCase();
  if (/\b(try again|again|yes|yeah|okay|ok|sure)\b/.test(text)) {
    return {
      intent: "retry_activity",
      reply: "No problem. I've put the reset back on screen for you.",
    };
  }
  if (/\b(continue|keep going|keep talking|move on|not now|skip)\b/.test(text)) {
    return {
      intent: "continue_session",
      reply: "All good. We can keep going with the demo and stay in conversation.",
    };
  }
  return {
    intent: "clarify",
    reply: "No pressure either way. Do you want to give the reset another go, or just keep the conversation moving?",
  };
}
