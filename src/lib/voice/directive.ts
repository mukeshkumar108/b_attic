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
  "- Do not hand them an interpretation of their own experience (\"that was a gift\", \"you were being present\"). Use their words and let them say what it meant.",
  "- Do not ask why they did something that is routine for them, and do not ask about what you already know about them.",
  "- If their answer is short, accept it and let it be.",
  "",
  "## OPENING",
  "Greet them in one short, warm line, then ask how they are doing right now. Wait for their answer before anything else. Keep it light and different each time. Use what you know about when you last spoke (first time today, back again, or a few days since). After they answer, acknowledge it in a line, then invite one small good moment from their day without suggesting what it might be.",
  "",
  "## CLOSING",
  "A session is finished when they have named a moment and stayed with it for a turn or two, or when they say they are heading off, going out, or have nothing more. When that happens, stop probing. Close with one short line that reflects the moment back in their own words, and one line that lets them go and says you would like to hear how it goes next time. Do not ask a question. Do not start a new topic or ask about plans, routes or what is next. Not every reply needs a question: a plain reflection is often enough.",
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

const localDay = (d: Date, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};
const localHour = (d: Date, timeZone: string) => {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(d)) % 24;
  } catch {
    return d.getUTCHours();
  }
};

/** When this session is, relative to their earlier ones. Reports are newest first. */
/** The session the person chose decides what time of day it is for this conversation; the clock is not used (it is a prototype and a morning session may be run at any hour). */
const PART_OF_DAY: Record<string, string> = {
  morning: "It is the start of their day.",
  evening: "It is the end of their day.",
  daytime: "It is somewhere in the middle of their day.",
};

export function sessionContext(reports: ReportSignals[], timezone: string, now: Date = new Date(), flow?: string): { kind: "first_ever" | "first_today" | "again_today"; line: string } {
  const part = PART_OF_DAY[flow ?? ""] ?? "";
  const when = part ? ` ${part}` : "";
  if (!reports.length) return { kind: "first_ever", line: `This is their first session with you.${when}` };
  const today = localDay(now, timezone);
  const earlierToday = reports.filter((r) => localDay(r.createdAt, timezone) === today).length;
  if (earlierToday > 0) {
    return { kind: "again_today", line: `They have already had ${earlierToday} session${earlierToday > 1 ? "s" : ""} today; this is number ${earlierToday + 1}.${when}` };
  }
  const days = Math.round((now.getTime() - reports[0].createdAt.getTime()) / 86_400_000);
  const since = days <= 1 ? "yesterday" : `${days} days ago`;
  return { kind: "first_today", line: `This is their first session today (they last spoke ${since}).${when}` };
}

/** The "what you know about them" block added to Bloom's prompt, or null when there is nothing to add. */
export function buildDirective(memory: MemoryState, reports: ReportSignals[], now: Date = new Date(), timezone = "UTC", flow?: string, person?: { name?: string | null; pronouns?: string | null }): Directive | null {
  const lines: string[] = [];
  const applied: string[] = [];

  if (person?.name?.trim()) {
    lines.push(`Their name is ${person.name.trim()}. Use it now and then, not every turn.${person.pronouns?.trim() ? ` Their pronouns are ${person.pronouns.trim()}.` : ""}`);
    applied.push("name");
  }

  const ctx = sessionContext(reports, timezone, now, flow);
  lines.push(ctx.line);
  applied.push(`session_${ctx.kind}`);

  const people = memory.people.filter((p) => p.sensitivity === "nominal").slice(0, 4);
  if (people.length) {
    lines.push(`People who matter to them: ${people.map((p) => (p.relation ? `${p.name} (${p.relation})` : p.name)).join(", ")}.`);
    applied.push("known_people");
  }

  const selfRegard = memory.facts.filter((f) => f.category === "self_regard" && f.sensitivity === "nominal").slice(-4);
  if (selfRegard.length) {
    lines.push(`Things they have said they like about themselves: ${selfRegard.map((f) => f.fact).join("; ")}. Bring one back only if it fits naturally.`);
    applied.push("self_regard");
  }

  const habits = memory.facts.filter((f) => f.habit && f.category !== "self_regard" && f.sensitivity === "nominal").slice(-3);
  for (const h of habits) lines.push(`Known, not news: ${h.fact}${h.count && h.count > 1 ? ` (mentioned ${h.count} times)` : ""}. Do not ask about it as if new.`);
  if (habits.length) applied.push("habits");
  const recurring = memory.themes.filter((t) => t.count >= 2 && t.sensitivity === "nominal").slice(-2);
  if (recurring.length) {
    lines.push(`Keeps coming back to: ${recurring.map((t) => t.label).join("; ")}.`);
    applied.push("recurring_themes");
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

  const text = [
    "## WHAT YOU KNOW ABOUT THEM",
    "Use this lightly, the way a friend remembers. Never open with it, never list it, and never say you were told or have notes. Raise something only if it fits what they are saying; if they do not pick it up, drop it.",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
  return { text, ruleVersion: RULE_VERSION, applied, surfacedThreadIds: due.map((t) => t.id) };
}
