import { describe, expect, it } from "vitest";
import { dueThreads, EMPTY_MEMORY, expireThreads, mergeMemory } from "./memory";

const t0 = new Date("2026-10-22T10:00:00Z");
const later = (days: number) => new Date(t0.getTime() + days * 86400000);

describe("mergeMemory", () => {
  it("adds a person once and counts later mentions, matching on name", () => {
    const a = mergeMemory(EMPTY_MEMORY, { people: [{ name: "Sarah", relation: "colleague" }] }, "c1", t0);
    const b = mergeMemory(a.memory, { people: [{ name: "sarah", meaning: "friction over the deadline" }] }, "c2", later(1));
    expect(b.memory.people).toHaveLength(1);
    expect(b.memory.people[0]).toMatchObject({ id: "person_sarah", count: 2, relation: "colleague", meaning: "friction over the deadline", source: "c2" });
    expect(b.applied[0]).toMatchObject({ action: "updated", id: "person_sarah" });
  });

  it("keeps a thread out of reach until notBefore, then due, then expired", () => {
    const m = mergeMemory(EMPTY_MEMORY, { threads: [{ topic: "Job interview", notBeforeDays: 5, expiresInDays: 8, suggestedCheckin: "How did the interview go?" }] }, "c1", t0).memory;
    expect(dueThreads(m, later(2))).toHaveLength(0);
    expect(dueThreads(m, later(6))).toHaveLength(1);
    expect(expireThreads(m, later(9)).openThreads[0].status).toBe("expired");
    expect(dueThreads(m, later(9))).toHaveLength(0);
  });

  it("never offers a sensitive thread proactively, and expires sensitive facts sooner", () => {
    const m = mergeMemory(EMPTY_MEMORY, {
      threads: [{ topic: "Sister's surgery", sensitivity: "sensitive", notBeforeDays: 0 }],
      facts: [{ fact: "Hurt knee on a walk", category: "health", sensitivity: "sensitive" }],
    }, "c1", t0).memory;
    expect(dueThreads(m, later(1))).toHaveLength(0);
    expect(m.facts[0].expiresAt).toBe(later(14).toISOString());
  });

  it("updates a thread's status by id instead of duplicating it", () => {
    const m1 = mergeMemory(EMPTY_MEMORY, { threads: [{ topic: "Client pitch" }] }, "c1", t0).memory;
    const m2 = mergeMemory(m1, { threads: [{ ref: m1.openThreads[0].id, topic: "", status: "resolved" }] }, "c2", later(3)).memory;
    expect(m2.openThreads).toHaveLength(1);
    expect(m2.openThreads[0].status).toBe("resolved");
  });

  it("drops expired facts and ignores empty items", () => {
    const m1 = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Has a cold", expiresInDays: 2 }, { fact: "  " }], people: [{ name: "" }] }, "c1", t0).memory;
    expect(m1.facts).toHaveLength(1);
    expect(mergeMemory(m1, {}, "c2", later(5)).memory.facts).toHaveLength(0);
  });
});

describe("style notes", () => {
  it("record the note itself as the basis so a reviewer can read it", () => {
    const r = mergeMemory(EMPTY_MEMORY, { style: { notes: ["Answers in a few words"] } }, "c1", t0);
    expect(r.applied[0]).toMatchObject({ kind: "style", basis: "Answers in a few words" });
  });
});

describe("habits", () => {
  it("merges the same fact said in different words and makes it a habit that stays", () => {
    const a = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Walks 5-6 miles around the village through fields", category: "habit", expiresInDays: 14 }] }, "c1", t0).memory;
    const b = mergeMemory(a, { facts: [{ fact: "Walks five or six miles through the fields every day", recurring: true }] }, "c2", later(1));
    expect(b.memory.facts).toHaveLength(1);
    expect(b.memory.facts[0]).toMatchObject({ count: 2, habit: true, lastMentioned: later(1).toISOString() });
    expect(new Date(b.memory.facts[0].expiresAt).getTime()).toBeGreaterThan(later(300).getTime());
  });

  it("trusts the model's ref when the wording differs completely", () => {
    const a = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Walks 5-6 miles around the village" }] }, "c1", t0).memory;
    const b = mergeMemory(a, { facts: [{ ref: a.facts[0].id, fact: "Goes out for a long circular route daily", recurring: true }] }, "c2", later(1)).memory;
    expect(b.facts).toHaveLength(1);
    expect(b.facts[0]).toMatchObject({ count: 2, habit: true });
  });

  it("merges by ref and does not merge unrelated facts", () => {
    const a = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Hurt knee on a walk" }, { fact: "Has a job interview on Tuesday" }] }, "c1", t0).memory;
    expect(a.facts).toHaveLength(2);
    const b = mergeMemory(a, { facts: [{ ref: a.facts[1].id, fact: "Interview went well" }] }, "c2", later(1)).memory;
    expect(b.facts).toHaveLength(2);
    expect(b.facts[1].count).toBe(2);
  });

  it("a one-off fact still expires", () => {
    const a = mergeMemory(EMPTY_MEMORY, { facts: [{ fact: "Had coffee in the sun", expiresInDays: 1 }] }, "c1", t0).memory;
    expect(mergeMemory(a, {}, "c2", later(3)).memory.facts).toHaveLength(0);
  });
});
