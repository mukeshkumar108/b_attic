import { z } from "zod";
import {
  callOpenRouterWithModelFallback,
  loadPromptMdStrict,
  parseJsonWithZod,
} from "@/lib/llm/openrouter";
import { getFirstReflectionDay0ModelChain } from "@/lib/voice/modelRouting";

const FirstReflectionLLMStateSchema = z.object({
  session_complete: z.boolean(),
  safety_flag: z.boolean(),
});

export const FIRST_REFLECTION_DAY0_HANDSHAKE_TEXT =
  "Welcome to your first reflection. We'll keep it simple. Share one real moment from your day that felt meaningful, even if it seemed small.";

export interface FirstReflectionTurnResult {
  assistantText: string;
  readyToEnd: boolean;
  safetyFlag: boolean;
}

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
  let cleaned = text.trim();
  cleaned = cleaned.replace(/STATE:\s*```json[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/STATE:\s*{[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/```json[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/^\s*REPLY:\s*/i, "");

  if (
    cleaned.includes('"session_complete"') ||
    cleaned.includes('"safety_flag"') ||
    (cleaned.startsWith("{") && cleaned.endsWith("}"))
  ) {
    return "";
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

function parseFirstReflectionLLMResponse(
  raw: string
): { reply: string; state: z.infer<typeof FirstReflectionLLMStateSchema> } | null {
  const stateFromFenced = raw.match(/STATE:\s*```json\s*([\s\S]*?)```/i)?.[1] ?? null;
  const stateFromInline = raw.match(/STATE:\s*({[\s\S]*})/i)?.[1] ?? null;
  const stateRaw = stateFromFenced ?? stateFromInline;
  if (!stateRaw) {
    return null;
  }

  const state = parseJsonWithZod(stateRaw, FirstReflectionLLMStateSchema);
  if (!state) {
    return null;
  }

  const replyMatch = raw.match(/REPLY:\s*([\s\S]*?)\n\s*STATE:/i);
  const reply = replyMatch?.[1]?.trim() ?? "";
  const cleanReply = sanitizeReplyForSpeech(
    reply.replace(/^```(?:text)?/i, "").replace(/```$/i, "").trim()
  );
  if (!cleanReply) {
    return null;
  }

  return { reply: cleanReply, state };
}

export async function runFirstReflectionDay0Turn(params: {
  transcript: string;
  promptTemplatePath: string;
  history?: Array<{ userTranscript: string; assistantText: string }>;
  profile?: {
    name?: string | null;
    ageRange?: string | null;
    sex?: string | null;
  };
}): Promise<FirstReflectionTurnResult> {
  const corePrompt = loadPromptMdStrict(params.promptTemplatePath);
  const runtimeContext = [
    "",
    "SESSION CONTEXT",
    "First reflection (day0)",
    `Name: ${params.profile?.name || "unknown"}`,
    `Age range: ${params.profile?.ageRange || "unknown"}`,
    `Sex: ${params.profile?.sex || "unknown"}`,
    "",
    "CONVERSATION SO FAR",
    formatConversationHistory(params.history ?? []),
    "",
    "USER TRANSCRIPT:",
    `User: ${params.transcript}`,
  ].join("\n");
  const prompt = `${corePrompt}\n${runtimeContext}`;

  try {
    const raw = await callOpenRouterWithModelFallback(prompt, {
      modelChain: getFirstReflectionDay0ModelChain(),
      contextLabel: "voice_first_reflection_day0",
      temperature: 0.4,
      maxTokens: 700,
    });
    const parsed = parseFirstReflectionLLMResponse(raw);
    if (parsed) {
      return {
        assistantText: parsed.reply,
        readyToEnd: parsed.state.session_complete,
        safetyFlag: parsed.state.safety_flag,
      };
    }
  } catch {
    // Fall through to heuristic fallback.
  }

  return {
    assistantText:
      "Thank you for sharing that. What part of that moment do you want to hold onto tonight?",
    readyToEnd: false,
    safetyFlag: false,
  };
}
