import { z } from "zod";
import {
  callOpenRouterWithModelFallback,
  loadPromptMdStrict,
  parseJsonWithZod,
} from "@/lib/llm/openrouter";
import { getFirstReflectionDay1To3ModelChain } from "@/lib/voice/modelRouting";

const ReflectionCoreLLMStateSchema = z.object({
  session_complete: z.boolean(),
  safety_flag: z.boolean(),
});

export const REFLECTION_CORE_HANDSHAKE_TEXT =
  "Welcome back. Let's reflect on one meaningful moment from your day. Start with whatever stands out most right now.";

export interface ReflectionCoreTurnResult {
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

function parseReflectionCoreLLMResponse(
  raw: string
): { reply: string; state: z.infer<typeof ReflectionCoreLLMStateSchema> } | null {
  const stateFromFenced = raw.match(/STATE:\s*```json\s*([\s\S]*?)```/i)?.[1] ?? null;
  const stateFromInline = raw.match(/STATE:\s*({[\s\S]*})/i)?.[1] ?? null;
  const stateRaw = stateFromFenced ?? stateFromInline;
  if (!stateRaw) {
    return null;
  }

  const state = parseJsonWithZod(stateRaw, ReflectionCoreLLMStateSchema);
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

export async function runReflectionCoreTurn(params: {
  transcript: string;
  promptTemplatePath: string;
  history?: Array<{ userTranscript: string; assistantText: string }>;
  profile?: {
    name?: string | null;
    ageRange?: string | null;
    sex?: string | null;
  };
}): Promise<ReflectionCoreTurnResult> {
  const corePrompt = loadPromptMdStrict(params.promptTemplatePath);
  const runtimeContext = [
    "",
    "SESSION CONTEXT",
    "Reflection core (post-day0)",
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
      modelChain: getFirstReflectionDay1To3ModelChain(),
      contextLabel: "voice_reflection_core",
      temperature: 0.4,
      maxTokens: 700,
    });
    const parsed = parseReflectionCoreLLMResponse(raw);
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
      "Thank you. Stay with that moment for one more beat. What detail in it feels most alive right now?",
    readyToEnd: false,
    safetyFlag: false,
  };
}
