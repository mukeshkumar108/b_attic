import { afterEach, describe, expect, it } from "vitest";
import { buildDirective, recentPatternRules, SESSION_GUARDRAILS, sessionContext, type ReportSignals } from "./directive";
import { EMPTY_MEMORY, mergeMemory } from "./memory";

const now = new Date("2026-10-22T10:00:00Z");
const rep = (profile: Record<string, unknown> | null, vf: Record<string, unknown> | null = null): ReportSignals => ({ createdAt: now, profile, voiceFeatures: vf });

describe("buildDirective", () => {
  it("always says when this session is, even with nothing remembered", () => {
    expect(buildDirective(EMPTY_MEMORY, [], now)!.text).toMatch(/first session with you/);
  });

  it("offers a due, nominal thread once the date has come and never a sensitive one", () => {
    const m = mergeMemory(EMPTY_MEMORY, { threads: [
      { topic: "Job interview", notBeforeDays: 2, expiresInDays: 9, suggestedCheckin: "How did the interview go?" },
      { topic: "Hospital results", sensitivity: "sensitive", notBeforeDays: 0 },
    ] }, "c1", now).memory;
    expect(buildDirective(m, [], new Date("2026-10-23T10:00:00Z"))!.text).not.toContain("interview");
    const d = buildDirective(m, [], new Date("2026-10-25T10:00:00Z"))!;
    expect(d.text).toContain("How did the interview go?");
    expect(d.text).not.toContain("Hospital");
    expect(d.surfacedThreadIds).toHaveLength(1);
  });

  it("names people and style notes, lightly", () => {
    const m = mergeMemory(EMPTY_MEMORY, { people: [{ name: "Dad", relation: "father" }], style: { notes: ["answers in a few words"] } }, "c1", now).memory;
    const d = buildDirective(m, [], now)!;
    expect(d.text).toContain("Dad (father)");
    expect(d.text).toContain("answers in a few words");
    expect(d.text).toMatch(/never open with it/i);
  });
});

describe("recentPatternRules", () => {
  it("fires the relational pivot only after three sessions without people", () => {
    expect(recentPatternRules([rep({ people_focus: "none" }), rep({ people_focus: "none" })])).toEqual([]);
    const three = [rep({ people_focus: "none" }), rep({ people_focus: "none" }), rep({ people_focus: "none" })];
    expect(recentPatternRules(three).map((r) => r.rule)).toContain("relational_pivot");
  });

  afterEach(() => {
    delete process.env.VOICE_RULE_LIGHTER_TOUCH;
  });

  it("keeps the voice-based lighter-touch rule off unless switched on", () => {
    const base = { f0_sd_st: 3.0, pause_ratio: 0.2 };
    const flat = { f0_sd_st: 1.9, pause_ratio: 0.32 };
    const reports = [rep(null, flat), rep(null, base), rep(null, base), rep(null, base)];
    expect(recentPatternRules(reports)).toEqual([]);
  });

  it("asks for a lighter touch only when the latest session is flatter than their own earlier ones", () => {
    process.env.VOICE_RULE_LIGHTER_TOUCH = "1";
    const base = { f0_sd_st: 3.0, pause_ratio: 0.2 };
    const flat = { f0_sd_st: 1.9, pause_ratio: 0.32 };
    const reports = [rep(null, flat), rep(null, base), rep(null, base), rep(null, base)];
    expect(recentPatternRules(reports).map((r) => r.rule)).toContain("lighter_touch");
    expect(recentPatternRules([rep(null, base), rep(null, base), rep(null, base), rep(null, base)])).toEqual([]);
    expect(recentPatternRules(reports.slice(0, 3))).toEqual([]); // not enough history
  });
});

describe("SESSION_GUARDRAILS", () => {
  it("forbids made-up personal experience and topic steering", () => {
    expect(SESSION_GUARDRAILS).toMatch(/no body, location, weather/);
    expect(SESSION_GUARDRAILS).toMatch(/Never suggest a category/);
    expect(SESSION_GUARDRAILS).toMatch(/## OPENING/);
    expect(SESSION_GUARDRAILS).toMatch(/## CLOSING[\s\S]*Do not ask a question/);
  });
});

describe("sessionContext", () => {
  const at = (iso: string): ReportSignals => ({ createdAt: new Date(iso), profile: null, voiceFeatures: null });
  it("tells a first session of the day from a second, in the person's own timezone", () => {
    const early = new Date("2026-10-22T08:00:00Z"); // 09:00 in London (BST)
    expect(sessionContext([at("2026-10-21T18:00:00Z")], "Europe/London", early)).toMatchObject({ kind: "first_today" });
    expect(sessionContext([at("2026-10-22T06:30:00Z")], "Europe/London", early)).toMatchObject({ kind: "again_today" });
    expect(sessionContext([at("2026-10-22T06:30:00Z")], "Europe/London", early).line).not.toMatch(/welcome|ask/i);
    // 23:30 UTC on the 21st is already the 22nd in London
    expect(sessionContext([at("2026-10-21T23:30:00Z")], "Europe/London", early).kind).toBe("again_today");
    expect(sessionContext([], "Europe/London", early).kind).toBe("first_ever");
  });

  it("says how long it has been and what part of the day it is", () => {
    const evening = new Date("2026-10-25T19:00:00Z");
    const c = sessionContext([at("2026-10-22T10:00:00Z")], "Europe/London", evening);
    expect(c.line).toMatch(/3 days ago/);
    expect(c.line).toMatch(/evening/);
  });
});

describe("habits in the directive", () => {
  it("presents a habit as known, not news", () => {
    const m = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Walks five to six miles daily", recurring: true }] }, "c1", now).memory;
    const d = buildDirective(m, [], now)!;
    expect(d.text).toMatch(/Known, not news: Walks five to six miles daily/);
    expect(d.applied).toContain("habits");
  });
});

describe("things they like about themselves", () => {
  it("are offered back lightly, and kept out of the habits list", () => {
    const m = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Is a good listener", category: "self_regard", recurring: true }] }, "c1", now).memory;
    const d = buildDirective(m, [], now)!;
    expect(d.text).toMatch(/like about themselves: Is a good listener/);
    expect(d.text).not.toMatch(/Known, not news: Is a good listener/);
  });
});
