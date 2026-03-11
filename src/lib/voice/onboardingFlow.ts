import { z } from "zod";
import { callOpenRouter, parseJsonWithZod } from "@/lib/llm/openrouter";

const TIMEZONE_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const TIME_LOCAL_REGEX = /^\d{2}:\d{2}$/;

export interface OnboardingDraft {
  displayName?: string | null;
  timezone?: string | null;
  reflectionReminderEnabled?: boolean | null;
  reflectionReminderTimeLocal?: string | null;
}

export interface OnboardingTurnResult {
  draft: OnboardingDraft;
  assistantText: string;
  readyToEnd: boolean;
}

const OnboardingLLMResultSchema = z.object({
  displayName: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  reflectionReminderEnabled: z.boolean().optional().nullable(),
  reflectionReminderTimeLocal: z.string().optional().nullable(),
  assistantText: z.string().min(1).max(400),
  readyToEnd: z.boolean(),
});

export function getOnboardingWelcomeText(draft: OnboardingDraft): string {
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
}): Promise<OnboardingTurnResult> {
  const llmResult = await tryLLMOnboarding(params.transcript, params.draft);
  if (llmResult) {
    return finalizeOnboardingDraft(mergeDraft(params.draft, llmResult), llmResult.assistantText);
  }

  return runHeuristicOnboarding(params.transcript, params.draft);
}

function mergeDraft(
  prev: OnboardingDraft,
  updates: Partial<OnboardingDraft>
): OnboardingDraft {
  const merged: OnboardingDraft = { ...prev, ...updates };

  if (merged.timezone && !isValidTimezone(merged.timezone)) {
    merged.timezone = prev.timezone ?? null;
  }
  if (
    merged.reflectionReminderTimeLocal &&
    !TIME_LOCAL_REGEX.test(merged.reflectionReminderTimeLocal)
  ) {
    merged.reflectionReminderTimeLocal = prev.reflectionReminderTimeLocal ?? null;
  }

  return merged;
}

async function tryLLMOnboarding(
  transcript: string,
  draft: OnboardingDraft
): Promise<(OnboardingDraft & { assistantText: string; readyToEnd: boolean }) | null> {
  const prompt = [
    "Extract onboarding fields from the user utterance.",
    "Return strict JSON only.",
    `Current draft: ${JSON.stringify(draft)}`,
    `User utterance: ${transcript}`,
    "JSON shape:",
    '{"displayName":string|null,"timezone":string|null,"reflectionReminderEnabled":boolean|null,"reflectionReminderTimeLocal":"HH:MM"|null,"assistantText":string,"readyToEnd":boolean}',
    "Rules:",
    "- Keep existing values unless user clearly changes them.",
    "- timezone must be IANA like America/New_York.",
    "- reminder time must be HH:MM 24h format.",
    "- Ask one short follow-up question in assistantText when fields are missing.",
    "- readyToEnd true only when displayName and timezone are present and reminder time is present if reminders are enabled.",
  ].join("\n");

  try {
    const raw = await callOpenRouter(prompt);
    const parsed = parseJsonWithZod(raw, OnboardingLLMResultSchema);
    if (!parsed) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function runHeuristicOnboarding(
  transcript: string,
  draft: OnboardingDraft
): OnboardingTurnResult {
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

  return finalizeOnboardingDraft(next, getFollowupText(next));
}

function finalizeOnboardingDraft(
  draft: OnboardingDraft,
  assistantText: string
): OnboardingTurnResult {
  const readyToEnd = isOnboardingComplete(draft);
  return {
    draft,
    assistantText: readyToEnd
      ? "Perfect. I have what I need. You can finish onboarding now."
      : assistantText,
    readyToEnd,
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
