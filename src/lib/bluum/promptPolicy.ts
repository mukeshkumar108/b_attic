/**
 * Prompt selection policy.
 * Deterministic selection based on user ID + date.
 * Implements tag rotation to avoid repetitive prompts.
 */

import { PROMPTS, getPrimaryTag, type Prompt } from "./prompts";

export interface PromptSelectionContext {
  userId: string;
  dateLocal: string;
  recentHistoryTags: string[]; // Primary tags from recent days (newest first)
  recentPromptIds: string[]; // PromptIds from recent days (newest first)
}

/**
 * Create a deterministic hash from strings.
 * Returns a number for use in selection.
 */
function deterministicHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get unique primary tags from prompts.
 */
function getUniquePrimaryTags(): string[] {
  const tags = new Set<string>();
  for (const prompt of PROMPTS) {
    tags.add(getPrimaryTag(prompt));
  }
  return Array.from(tags);
}

/**
 * Select a prompt for a given date.
 * Rules:
 * - Avoid repeating same primary tag more than 2 days consecutively when possible
 * - Avoid choosing from last 3 promptIds when possible
 * - Deterministic: same user + date => same selection
 */
export function selectPromptForDate(ctx: PromptSelectionContext): Prompt {
  const { userId, dateLocal, recentHistoryTags, recentPromptIds } = ctx;

  // Get available prompts, filtering out recently used
  let candidates = [...PROMPTS];

  // Avoid last 3 promptIds if we have enough options
  const avoidPromptIds = new Set(recentPromptIds.slice(0, 3));
  const filteredByPromptId = candidates.filter(
    (p) => !avoidPromptIds.has(p.id)
  );
  if (filteredByPromptId.length >= 5) {
    candidates = filteredByPromptId;
  }

  // Check if we need to avoid a tag (same tag 2 consecutive days)
  let tagToAvoid: string | null = null;
  if (recentHistoryTags.length >= 2) {
    const [yesterday, dayBefore] = recentHistoryTags;
    if (yesterday === dayBefore) {
      tagToAvoid = yesterday;
    }
  }

  // Filter out the tag to avoid if we have enough options
  if (tagToAvoid) {
    const filteredByTag = candidates.filter(
      (p) => getPrimaryTag(p) !== tagToAvoid
    );
    if (filteredByTag.length >= 3) {
      candidates = filteredByTag;
    }
  }

  // Deterministic selection from candidates
  const hash = deterministicHash(`${userId}-${dateLocal}`);
  const index = hash % candidates.length;

  return candidates[index];
}

/**
 * Pick an alternate prompt for swap.
 * Must be different from current prompt.
 * Prefer different primary tag when possible.
 */
export function pickAlternatePromptForSwap(
  currentPromptId: string,
  ctx: PromptSelectionContext
): Prompt {
  const { userId, dateLocal } = ctx;
  const currentPrompt = PROMPTS.find((p) => p.id === currentPromptId);
  const currentTag = currentPrompt ? getPrimaryTag(currentPrompt) : null;

  // Filter out current prompt
  let candidates = PROMPTS.filter((p) => p.id !== currentPromptId);

  // Prefer different primary tag
  if (currentTag) {
    const differentTagCandidates = candidates.filter(
      (p) => getPrimaryTag(p) !== currentTag
    );
    if (differentTagCandidates.length >= 3) {
      candidates = differentTagCandidates;
    }
  }

  // Deterministic selection (add "swap" to seed for different result)
  const hash = deterministicHash(`${userId}-${dateLocal}-swap`);
  const index = hash % candidates.length;

  return candidates[index];
}

/**
 * Get the list of unique primary tags for reference.
 */
export function getAllPrimaryTags(): string[] {
  return getUniquePrimaryTags();
}
