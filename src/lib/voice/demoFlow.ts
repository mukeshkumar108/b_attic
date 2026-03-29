import {
  callOpenRouterWithModelFallback,
  parseJsonWithZod,
} from "@/lib/llm/openrouter";
import { z } from "zod";
import { getFirstReflectionDay1To3ModelChain } from "@/lib/voice/modelRouting";

export const VOICE_DEMO_HANDSHAKE_TEXT =
  "Welcome to the voice demo. I'll give you a feel for how a session can flow, including a quick guided reset in the middle. To start, tell me what usually helps you settle in when you're trying something new.";

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
  const prompt = [
    "You are Bluum in a product demo voice flow.",
    "Keep replies natural, warm, and concise.",
    "Never mention JSON, tool calls, or internal state.",
    "The user is testing how conversation can pause for a guided activity and then resume smoothly.",
    params.mode === "pre_activity"
      ? "Reply to the user naturally, then tee up a short breathing reset. Do not sound salesy. End in a way that makes the breathing invitation feel natural."
      : params.mode === "post_activity"
        ? "The guided breathing step just ended. Reply naturally using the activity result and continue the conversation with one grounded follow-up question."
        : "Continue naturally after the guided activity. This is the closing turn, so be warm, lightly reflective, and wrap the demo without opening a big new thread.",
    "",
    "SESSION CONTEXT",
    `Name: ${params.profile?.name || "unknown"}`,
    params.activityResultSummary
      ? `Activity result: ${params.activityResultSummary}`
      : "Activity result: none yet",
    "",
    "CONVERSATION SO FAR",
    formatConversationHistory(history),
    "",
    "LATEST USER INPUT",
    `User: ${params.transcript}`,
  ].join("\n");

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
  const prompt = [
    "You are resolving a narrow voice intervention offer for Bluum.",
    "The assistant previously suggested a short breathing reset in the middle of a demo session.",
    "Classify the user's latest response as exactly one of: accept, decline, clarify.",
    "Use accept for yes/okay/sounds good/if it's short.",
    "Use decline for no/not now/keep talking/continue without it.",
    "Use clarify for questions, uncertainty, or mixed responses.",
    "Return JSON only with keys intent and reply.",
    "The reply should be short, natural, and spoken.",
    "If clarify, answer briefly and re-offer the same breathing reset.",
    "If accept, acknowledge and say the reset is ready to start.",
    "If decline, acknowledge and continue the demo without pressure.",
    "",
    "SESSION CONTEXT",
    `Name: ${params.profile?.name || "unknown"}`,
    "",
    "CONVERSATION SO FAR",
    formatConversationHistory(history),
    "",
    "LATEST USER INPUT",
    `User: ${params.transcript}`,
  ].join("\n");

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
  const prompt = [
    "You are resolving a narrow follow-up after the user dismissed the breathing reset UI in a Bluum voice demo.",
    "Classify the user's latest response as exactly one of: retry_activity, continue_session, clarify.",
    "Use retry_activity if the user wants to try the breathing reset again.",
    "Use continue_session if the user wants to keep talking and move on.",
    "Use clarify if the user is asking a question or still unsure.",
    "Return JSON only with keys intent and reply.",
    "If retry_activity, acknowledge and say the reset is ready again.",
    "If continue_session, acknowledge and smoothly continue the demo.",
    "If clarify, answer briefly and ask whether they want to retry or continue.",
    "",
    "SESSION CONTEXT",
    `Name: ${params.profile?.name || "unknown"}`,
    "",
    "CONVERSATION SO FAR",
    formatConversationHistory(history),
    "",
    "LATEST USER INPUT",
    `User: ${params.transcript}`,
  ].join("\n");

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
