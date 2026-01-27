/**
 * Coaching module for gratitude reflections.
 * Implements safety gate + rubric scoring with LLM.
 */

import { z } from "zod";
import {
  callLLMWithTemplate,
  loadPromptMd,
  fillTemplate,
  callOpenRouter,
  parseJsonWithZod,
} from "@/lib/llm/openrouter";

// ============================================================================
// Zod Schemas
// ============================================================================

export const SafetyGateResultSchema = z.object({
  flagged: z.boolean(),
  reason: z.enum(["self_harm", "other", "none"]),
});

export type SafetyGateResult = z.infer<typeof SafetyGateResultSchema>;

export const RubricScoresSchema = z.object({
  specificity: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  meaning: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  emotion: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

export const CoachResultSchema = z.object({
  scores: RubricScoresSchema,
  coachType: z.enum(["VALIDATE", "NUDGE"]),
  coachText: z.string().max(200), // Allow slight buffer for LLM
});

export type CoachResult = z.infer<typeof CoachResultSchema>;

// ============================================================================
// Safety Gate
// ============================================================================

const SAFETY_GATE_TEMPLATE = "src/lib/llm/prompts/safety_gate.md";

export interface SafetyGateInput {
  promptText: string;
  responseText: string;
}

/**
 * Run safety gate to detect self-harm/suicidal intent.
 * Returns safe default if LLM fails.
 */
export async function runSafetyGate(
  input: SafetyGateInput
): Promise<SafetyGateResult> {
  try {
    const result = await callLLMWithTemplate(
      SAFETY_GATE_TEMPLATE,
      {
        PROMPT: input.promptText,
        RESPONSE: input.responseText,
      },
      SafetyGateResultSchema
    );

    if (result) {
      return result;
    }
  } catch (err) {
    console.error("Safety gate LLM error:", err);
  }

  // Safe fallback: don't flag (avoid false positives blocking users)
  return { flagged: false, reason: "none" };
}

// ============================================================================
// Rubric Coach
// ============================================================================

const COACH_TEMPLATE = "src/lib/llm/prompts/coach_reflection.md";

export interface RubricCoachInput {
  promptText: string;
  responseText: string;
}

export interface RubricCoachOutput {
  scores: {
    specificity: number;
    meaning: number;
    emotion: number;
  };
  coachType: "VALIDATE" | "NUDGE";
  coachText: string;
}

// Fallback messages when LLM fails
const FALLBACK_VALIDATE_MESSAGE = "Thanks for taking a moment to reflect today.";

/**
 * Run rubric coaching to score reflection and generate feedback.
 * Returns safe fallback if LLM fails.
 */
export async function runRubricCoach(
  input: RubricCoachInput
): Promise<RubricCoachOutput> {
  try {
    const result = await callLLMWithTemplate(
      COACH_TEMPLATE,
      {
        PROMPT: input.promptText,
        RESPONSE: input.responseText,
      },
      CoachResultSchema
    );

    if (result) {
      // Ensure coachText is within limit
      const coachText =
        result.coachText.length > 180
          ? result.coachText.slice(0, 177) + "..."
          : result.coachText;

      return {
        scores: result.scores,
        coachType: result.coachType,
        coachText,
      };
    }
  } catch (err) {
    console.error("Rubric coach LLM error:", err);
  }

  // Safe fallback: validate with neutral message
  return {
    scores: { specificity: 1, meaning: 1, emotion: 1 },
    coachType: "VALIDATE",
    coachText: FALLBACK_VALIDATE_MESSAGE,
  };
}

// ============================================================================
// Safety Response (when flagged)
// ============================================================================

export interface SafetyResponse {
  message: string;
  resources: {
    label: string;
    value: string;
  }[];
}

/**
 * Get safe response with crisis resources.
 * Used when safety gate flags a reflection.
 */
export function getSafetyResponse(): SafetyResponse {
  return {
    message:
      "It sounds like you might be going through a difficult time. " +
      "Your feelings are valid, and support is available. " +
      "Please consider reaching out to someone who can help.",
    resources: [
      {
        label: "US - 988 Suicide & Crisis Lifeline",
        value: "Call or text 988",
      },
      {
        label: "UK - Samaritans",
        value: "Call 116 123 (free, 24/7)",
      },
      {
        label: "International",
        value: "Contact your local emergency services",
      },
      {
        label: "Crisis Text Line (US)",
        value: "Text HOME to 741741",
      },
    ],
  };
}
