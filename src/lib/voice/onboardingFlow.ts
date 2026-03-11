import { z } from "zod";
import {
  callOpenRouterWithOptions,
  loadPromptMdStrict,
  parseJsonWithZod,
} from "@/lib/llm/openrouter";

const TIMEZONE_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const TIME_LOCAL_REGEX = /^\d{2}:\d{2}$/;
const OnboardingLLMStateSchema = z.object({
  session_complete: z.boolean(),
  safety_flag: z.boolean(),
});

export const ONBOARDING_HANDSHAKE_TEXT =
  "Welcome to Bluum. I'm really glad you're here. Most gratitude apps ask you to write lists of things you're grateful for every day. You write them and usually nothing really changes. Bluum works a little differently. Each evening we have a short conversation and find one real moment from your day, something small you might normally rush past. And we go back into it together and actually feel it again. That's the part that slowly rewires how your brain sees your day over time. Not the list, the feeling. Before we go any further, I'm curious, have you ever tried gratitude before? A journal, an app, anything like that?";

export interface OnboardingDraft {
  displayName?: string | null;
  timezone?: string | null;
  reflectionReminderEnabled?: boolean | null;
  reflectionReminderTimeLocal?: string | null;
  sessionComplete?: boolean | null;
}

export interface OnboardingTurnResult {
  draft: OnboardingDraft;
  assistantText: string;
  readyToEnd: boolean;
  safetyFlag: boolean;
}

export function getOnboardingWelcomeText(draft: OnboardingDraft): string {
  if (!draft.displayName && !draft.sessionComplete) {
    return ONBOARDING_HANDSHAKE_TEXT;
  }
  if (!draft.displayName) {
    return "Welcome. What name should I use for you?";
  }
  return (
    `Welcome back, ${draft.displayName}. ` +
    "Please confirm your timezone and reminder preference."
  );
}

export async function runOnboardingTurn(params: {
  transcript: string;
  draft: OnboardingDraft;
  promptTemplatePath: string;
  history?: Array<{ userTranscript: string; assistantText: string }>;
  profile?: {
    name?: string | null;
    ageRange?: string | null;
    sex?: string | null;
  };
}): Promise<OnboardingTurnResult> {
  const llmResult = await tryLLMOnboarding({
    transcript: params.transcript,
    draft: params.draft,
    promptTemplatePath: params.promptTemplatePath,
    history: params.history ?? [],
    profile: params.profile,
  });
  if (llmResult) {
    const extracted = extractDraftFromTranscript(params.transcript, params.draft);
    const merged = mergeDraft(params.draft, extracted);
    const sessionComplete = llmResult.state.session_complete;
    return finalizeOnboardingDraft(
      { ...merged, sessionComplete },
      llmResult.reply,
      llmResult.state.safety_flag
    );
  }

  return runHeuristicOnboarding(params.transcript, params.draft);
}

function mergeDraft(
  prev: OnboardingDraft,
  updates: Partial<OnboardingDraft>
): OnboardingDraft {
  const merged: OnboardingDraft = { ...prev };

  if (typeof updates.displayName === "string" && updates.displayName.trim()) {
    merged.displayName = updates.displayName.trim();
  }
  if (typeof updates.timezone === "string" && updates.timezone.trim()) {
    merged.timezone = updates.timezone.trim();
  }
  if (typeof updates.reflectionReminderEnabled === "boolean") {
    merged.reflectionReminderEnabled = updates.reflectionReminderEnabled;
  }
  if (
    typeof updates.reflectionReminderTimeLocal === "string" &&
    updates.reflectionReminderTimeLocal.trim()
  ) {
    merged.reflectionReminderTimeLocal = updates.reflectionReminderTimeLocal.trim();
  }

  if (merged.timezone && !isValidTimezone(merged.timezone)) {
    merged.timezone = prev.timezone ?? null;
  }
  if (
    merged.reflectionReminderTimeLocal &&
    !TIME_LOCAL_REGEX.test(merged.reflectionReminderTimeLocal)
  ) {
    merged.reflectionReminderTimeLocal = prev.reflectionReminderTimeLocal ?? null;
  }
  if (typeof updates.sessionComplete === "boolean") {
    merged.sessionComplete = updates.sessionComplete;
  }

  return merged;
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

function parseOnboardingLLMResponse(
  raw: string
): { reply: string; state: z.infer<typeof OnboardingLLMStateSchema> } | null {
  const stateFromFenced = raw.match(/STATE:\s*```json\s*([\s\S]*?)```/i)?.[1] ?? null;
  const stateFromInline = raw.match(/STATE:\s*({[\s\S]*})/i)?.[1] ?? null;
  const stateRaw = stateFromFenced ?? stateFromInline;
  if (!stateRaw) {
    return null;
  }

  const state = parseJsonWithZod(stateRaw, OnboardingLLMStateSchema);
  if (!state) {
    return null;
  }

  const replyMatch = raw.match(/REPLY:\s*([\s\S]*?)\n\s*STATE:/i);
  const reply = replyMatch?.[1]?.trim() ?? "";
  const cleanReply = sanitizeOnboardingReplyForSpeech(
    reply.replace(/^```(?:text)?/i, "").replace(/```$/i, "").trim()
  );
  if (!cleanReply) {
    return null;
  }

  return { reply: cleanReply, state };
}

export function sanitizeOnboardingReplyForSpeech(text: string): string {
  let cleaned = text.trim();

  // Strip accidental control/output sections if the model leaks format scaffolding.
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

async function tryLLMOnboarding(params: {
  transcript: string;
  draft: OnboardingDraft;
  promptTemplatePath: string;
  history: Array<{ userTranscript: string; assistantText: string }>;
  profile?: {
    name?: string | null;
    ageRange?: string | null;
    sex?: string | null;
  };
}): Promise<{ reply: string; state: z.infer<typeof OnboardingLLMStateSchema> } | null> {
  const corePrompt = loadPromptMdStrict(params.promptTemplatePath);
  const runtimeContext = [
    "",
    "SESSION CONTEXT",
    "First ever session",
    `Name: ${params.profile?.name || params.draft.displayName || "unknown"}`,
    `Age range: ${params.profile?.ageRange || "unknown"}`,
    `Sex: ${params.profile?.sex || "unknown"}`,
    "",
    "CONVERSATION SO FAR",
    formatConversationHistory(params.history),
    "",
    "USER TRANSCRIPT:",
    `User: ${params.transcript}`,
  ].join("\n");
  const prompt = `${corePrompt}\n${runtimeContext}`;

  try {
    const raw = await callOpenRouterWithOptions(prompt, {
      model: process.env.OPENROUTER_ONBOARDING_MODEL,
      temperature: 0.4,
      maxTokens: 700,
    });
    return parseOnboardingLLMResponse(raw);
  } catch {
    return null;
  }
}

function runHeuristicOnboarding(
  transcript: string,
  draft: OnboardingDraft
): OnboardingTurnResult {
  const next = extractDraftFromTranscript(transcript, draft);
  return finalizeOnboardingDraft(next, getFollowupText(next), false);
}

function extractDraftFromTranscript(
  transcript: string,
  draft: OnboardingDraft
): OnboardingDraft {
  const next: OnboardingDraft = { ...draft };
  const text = transcript.trim();
  const lower = text.toLowerCase();

  const timezoneMatch = text.match(/\b[A-Za-z_]+\/[A-Za-z_]+\b/);
  if (timezoneMatch && isValidTimezone(timezoneMatch[0])) {
    next.timezone = timezoneMatch[0];
  }

  const timeMatch = text.match(/\b\d{2}:\d{2}\b/);
  if (timeMatch && TIME_LOCAL_REGEX.test(timeMatch[0])) {
    next.reflectionReminderTimeLocal = timeMatch[0];
  }

  if (/no reminders?|don't remind|disable reminders?/.test(lower)) {
    next.reflectionReminderEnabled = false;
  } else if (/remind|reminder|yes/.test(lower)) {
    next.reflectionReminderEnabled = true;
  }

  const nameMatch =
    text.match(/(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z '\-]{0,49})/i) ??
    null;
  if (nameMatch) {
    next.displayName = nameMatch[1].trim();
  } else if (!next.displayName && /^[A-Za-z][A-Za-z '\-]{0,49}$/.test(text)) {
    next.displayName = text;
  }

  return next;
}

function finalizeOnboardingDraft(
  draft: OnboardingDraft,
  assistantText: string,
  safetyFlag: boolean
): OnboardingTurnResult {
  const readyToEnd = isOnboardingComplete(draft) || Boolean(draft.sessionComplete);
  return {
    draft,
    assistantText,
    readyToEnd,
    safetyFlag,
  };
}

function getFollowupText(draft: OnboardingDraft): string {
  if (!draft.displayName) {
    return "What name should I call you?";
  }
  if (!draft.timezone) {
    return "What is your timezone? For example, America/New_York.";
  }
  if (draft.reflectionReminderEnabled === null || draft.reflectionReminderEnabled === undefined) {
    return "Would you like daily reflection reminders?";
  }
  if (draft.reflectionReminderEnabled && !draft.reflectionReminderTimeLocal) {
    return "What reminder time should I use in HH:MM format?";
  }
  return "I have your onboarding details.";
}

export function isOnboardingComplete(draft: OnboardingDraft): boolean {
  if (draft.sessionComplete) {
    return true;
  }
  if (!draft.displayName || !draft.timezone) {
    return false;
  }
  if (draft.reflectionReminderEnabled === null || draft.reflectionReminderEnabled === undefined) {
    return false;
  }
  if (draft.reflectionReminderEnabled && !draft.reflectionReminderTimeLocal) {
    return false;
  }
  return true;
}

export function isValidTimezone(timezone: string): boolean {
  if (!TIMEZONE_REGEX.test(timezone)) {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
