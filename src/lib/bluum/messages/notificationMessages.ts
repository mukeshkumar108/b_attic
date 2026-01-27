/**
 * Notification message pools for future reminder workflows.
 * No sending logic now - just the message pools.
 */

/**
 * Evening reminder messages (before reflection deadline).
 */
export const EVENING_REMINDER_MESSAGES: string[] = [
  "A moment for gratitude before the day ends?",
  "Quick check-in: noticed anything good today?",
  "Evening reminder: your reflection awaits.",
  "Before you wind down, one thing you appreciated today?",
  "Day's almost done. Time for a quick reflection?",
  "Haven't reflected yet today. Got a moment?",
  "Your daily gratitude check-in is waiting.",
  "One small reflection before bed?",
  "End your day with a moment of appreciation?",
  "Quick reminder: capture something good from today.",
  "Your gratitude practice is waiting for you.",
  "A brief pause to notice something positive?",
  "Before the day ends, what went well?",
  "Evening nudge: time for your reflection.",
  "One moment of gratitude before tomorrow?",
];

/**
 * Follow-up reminder messages (if first reminder was ignored).
 */
export const FOLLOWUP_REMINDER_MESSAGES: string[] = [
  "Still time to reflect on today.",
  "One quick thought before tomorrow?",
  "Your streak is waiting.",
  "A moment now, or catch up tomorrow.",
  "Last chance for today's reflection.",
  "Even a short reflection counts.",
  "Quick note before the day resets?",
];

/**
 * Deterministic hash for selection.
 */
function deterministicHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export interface MessageSelectionContext {
  userId: string;
  dateLocal: string;
  pool: "evening" | "followup";
}

/**
 * Pick a notification message deterministically.
 */
export function pickMessageForDate(ctx: MessageSelectionContext): string {
  const { userId, dateLocal, pool } = ctx;

  const messages =
    pool === "evening"
      ? EVENING_REMINDER_MESSAGES
      : FOLLOWUP_REMINDER_MESSAGES;

  const hash = deterministicHash(`${userId}-${dateLocal}-${pool}`);
  const index = hash % messages.length;

  return messages[index];
}
