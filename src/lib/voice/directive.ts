import { dueThreads, type MemoryState } from "./memory";

export const RULE_VERSION = "rules-v0.1";

/**
 * The voice-quality rule compares noisy phone-microphone numbers against a person's own history. Until we have enough real
 * sessions to calibrate for background noise it stays off (the numbers are still recorded). Set VOICE_RULE_LIGHTER_TOUCH=1 to turn it on.
 */
const lighterTouchEnabled = () => process.env.VOICE_RULE_LIGHTER_TOUCH === "1";

/** Always added to a session prompt, with or without anything remembered. */
export const SESSION_GUARDRAILS = [
  "## HOW YOU TALK IN THIS SESSION",
  "- You are an AI companion. You have no body, location, weather, meals or day of your own. Never say things like \"it's sunny here too\" or \"I was just doing...\". Connect through warmth, humour and listening, not made-up experiences of your own. If they ask about you, say so lightly and turn back to them.",
  "- Do not steer them toward a topic. Ask open questions about what they just said or about how it was (\"what caught your eye?\", \"what stood out?\", \"tell me more about that\"). Never suggest a category or an example (do not ask about animals, food, people, music or nature unless they raised it first). What they pick out for themselves is the point.",
  "- If their answer is short, accept it and let it be.",
].join("\n");

export interface ReportSignals {
  createdAt: Date;
  profile: Record<string, unknown> | null;
  voiceFeatures: Record<string, unknown> | null;
}

export interface Directive {
  text: string;
  ruleVersion: string;
  applied: string[];
  surfacedThreadIds: string[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Reports are newest first. Returns the rule names that fire from the person's recent sessions. */
export function recentPatternRules(reports: ReportSignals[]): { rule: string; line: string }[] {
  const out: { rule: string; line: string }[] = [];
  const profiles = reports.slice(0, 3).map((r) => r.profile);

  if (profiles.length === 3 && profiles.every((p) => p?.people_focus === "none")) {
    out.push({
      rule: "relational_pivot",
      line: "Their last few good moments were about tasks and things, not people. If it fits, ask who was part of it or who made it easier. Only once.",
    });
  }
  if (profiles.length === 3 && profiles.every((p) => p?.expression === "brief")) {
    out.push({
      rule: "short_answers_ok",
      line: "They usually answer briefly and that is fine. Do not press for more detail. One gentle question at most, then let it be.",
    });
  }

  // Own-baseline comparison: the latest session against the few before it (needs real history to mean anything).
  if (lighterTouchEnabled() && reports.length >= 4) {
    const [latest, ...before] = reports;
    const prior = before.slice(0, 3);
    const sd = prior.map((r) => num(r.voiceFeatures?.f0_sd_st)).filter((x): x is number => x !== null);
    const pause = prior.map((r) => num(r.voiceFeatures?.pause_ratio)).filter((x): x is number => x !== null);
    const lSd = num(latest.voiceFeatures?.f0_sd_st);
    const lPause = num(latest.voiceFeatures?.pause_ratio);
    if (sd.length >= 2 && pause.length >= 2 && lSd !== null && lPause !== null && lSd < 0.75 * mean(sd) && lPause > 1.25 * mean(pause)) {
      out.push({
        rule: "lighter_touch",
        line: "Last time their voice was flatter and slower than usual for them. They may be tired or low. Keep this one light: fewer questions, accept simple answers, nothing probing.",
      });
    }
  }
  return out;
}

/** The "what you know about them" block added to Bloom's prompt, or null when there is nothing to add. */
export function buildDirective(memory: MemoryState, reports: ReportSignals[], now: Date = new Date()): Directive | null {
  const lines: string[] = [];
  const applied: string[] = [];

  const people = memory.people.filter((p) => p.sensitivity === "nominal").slice(0, 4);
  if (people.length) {
    lines.push(`People who matter to them: ${people.map((p) => (p.relation ? `${p.name} (${p.relation})` : p.name)).join(", ")}.`);
    applied.push("known_people");
  }

  const due = dueThreads(memory, now).slice(0, 2);
  for (const t of due) {
    lines.push(
      `Coming up or unresolved: ${t.topic}.${t.suggestedCheckin ? ` If it fits, something like: "${t.suggestedCheckin}"` : " If it fits, ask lightly how it went."}`
    );
  }
  if (due.length) applied.push("due_threads");

  const notes = memory.style.notes.slice(-3);
  if (notes.length) {
    lines.push(`How they like to talk: ${notes.join("; ")}.`);
    applied.push("style_notes");
  }

  for (const r of recentPatternRules(reports)) {
    lines.push(r.line);
    applied.push(r.rule);
  }

  if (!lines.length) return null;
  const text = [
    "## WHAT YOU KNOW ABOUT THEM",
    "Use this lightly, the way a friend remembers. Never open with it, never list it, and never say you were told or have notes. Raise something only if it fits what they are saying; if they do not pick it up, drop it.",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
  return { text, ruleVersion: RULE_VERSION, applied, surfacedThreadIds: due.map((t) => t.id) };
}
