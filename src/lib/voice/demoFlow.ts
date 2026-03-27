import {
  callOpenRouterWithModelFallback,
} from "@/lib/llm/openrouter";
import { getFirstReflectionDay1To3ModelChain } from "@/lib/voice/modelRouting";

export const VOICE_DEMO_HANDSHAKE_TEXT =
  "Welcome to the voice demo. I'll give you a feel for how a session can flow, including a quick guided reset in the middle. To start, tell me what usually helps you settle in when you're trying something new.";

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
