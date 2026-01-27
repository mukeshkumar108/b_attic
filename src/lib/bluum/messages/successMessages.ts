/**
 * Success messages shown after reflection submission.
 * Deterministic selection based on user + date.
 */

/**
 * Default pool of success messages.
 */
export const DEFAULT_SUCCESS_MESSAGES: string[] = [
  "Nice work taking a moment to reflect today.",
  "Another day of noticing the good. Well done.",
  "Your reflection is saved. Small moments add up.",
  "Thanks for pausing to appreciate something today.",
  "Reflection complete. You showed up for yourself.",
  "Gratitude noted. Keep building that awareness.",
  "You took time to notice what matters. That counts.",
  "Saved. Every reflection strengthens the habit.",
  "Your practice continues. One day at a time.",
  "Reflection logged. You're doing the work.",
  "Another moment captured. Keep going.",
  "You paused and reflected. That's the practice.",
  "Done for today. See you tomorrow.",
  "Reflection saved. Small steps, steady progress.",
  "Good work noticing something positive today.",
];

/**
 * Milestone-specific messages (override defaults on special days).
 */
export const MILESTONE_SUCCESS_MESSAGES: Record<number, string> = {
  1: "You've started your gratitude practice. Day one is done!",
  7: "One week of reflections! You're building a real habit.",
  21: "Three weeks in. This practice is becoming part of your routine.",
  30: "A full month of gratitude reflections. Impressive consistency.",
  50: "50 reflections. You've built something meaningful here.",
  100: "100 reflections! Your gratitude practice is well established.",
  365: "A full year of gratitude. That's remarkable dedication.",
};

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

export interface SuccessMessageContext {
  currentStreak: number;
  totalReflections: number;
  userId: string;
  dateLocal: string;
}

/**
 * Get success message for a reflection.
 * Checks milestones first, then deterministically selects from pool.
 */
export function getSuccessMessage(ctx: SuccessMessageContext): string {
  const { totalReflections, userId, dateLocal } = ctx;

  // Check for milestone (based on total reflections after this one)
  const newTotal = totalReflections + 1;
  if (MILESTONE_SUCCESS_MESSAGES[newTotal]) {
    return MILESTONE_SUCCESS_MESSAGES[newTotal];
  }

  // Deterministic selection from default pool
  const hash = deterministicHash(`${userId}-${dateLocal}-success`);
  const index = hash % DEFAULT_SUCCESS_MESSAGES.length;

  return DEFAULT_SUCCESS_MESSAGES[index];
}
