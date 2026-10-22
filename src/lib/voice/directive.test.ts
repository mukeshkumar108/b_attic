import { describe, expect, it } from "vitest";
import { buildDirective, recentPatternRules, type ReportSignals } from "./directive";
import { EMPTY_MEMORY, mergeMemory } from "./memory";

const now = new Date("2026-10-22T10:00:00Z");
const rep = (profile: Record<string, unknown> | null, vf: Record<string, unknown> | null = null): ReportSignals => ({ createdAt: now, profile, voiceFeatures: vf });

describe("buildDirective", () => {
  it("returns null with nothing known", () => {
    expect(buildDirective(EMPTY_MEMORY, [], now)).toBeNull();
  });

  it("offers a due, nominal thread once the date has come and never a sensitive one", () => {
    const m = mergeMemory(EMPTY_MEMORY, { threads: [
      { topic: "Job interview", notBeforeDays: 2, expiresInDays: 9, suggestedCheckin: "How did the interview go?" },
      { topic: "Hospital results", sensitivity: "sensitive", notBeforeDays: 0 },
    ] }, "c1", now).memory;
    expect(buildDirective(m, [], new Date("2026-10-23T10:00:00Z"))).toBeNull();
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

  it("asks for a lighter touch only when the latest session is flatter than their own earlier ones", () => {
    const base = { f0_sd_st: 3.0, pause_ratio: 0.2 };
    const flat = { f0_sd_st: 1.9, pause_ratio: 0.32 };
    const reports = [rep(null, flat), rep(null, base), rep(null, base), rep(null, base)];
    expect(recentPatternRules(reports).map((r) => r.rule)).toContain("lighter_touch");
    expect(recentPatternRules([rep(null, base), rep(null, base), rep(null, base), rep(null, base)])).toEqual([]);
    expect(recentPatternRules(reports.slice(0, 3))).toEqual([]); // not enough history
  });
});
