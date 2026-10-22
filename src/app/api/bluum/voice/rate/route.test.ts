import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  memory: null as unknown,
  report: null as unknown,
  memoryUpdate: vi.fn(),
  reportUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/requireVoiceUser", () => ({ requireVoiceUser: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userMemory: { findUnique: async () => db.memory, update: (a: unknown) => db.memoryUpdate(a) },
    voiceSessionReport: { findFirst: async () => db.report, update: (a: unknown) => db.reportUpdate(a) },
  },
}));

import { POST } from "./route";

const call = (body: unknown) => POST(new Request("http://x/api/bluum/voice/rate", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  db.memoryUpdate.mockReset();
  db.reportUpdate.mockReset();
  db.memory = {
    people: [{ id: "person_dad", name: "Dad", correct: null }],
    themes: [], facts: [{ id: "fact_knee", fact: "Hurt knee", correct: null }], openThreads: [], style: { notes: [] },
  };
  db.report = { id: "r1", memoryUpdates: [{ id: "fact_knee", kind: "fact", action: "added" }, { id: "person_dad", kind: "person", action: "added" }] };
});

describe("POST /api/bluum/voice/rate", () => {
  it("saves the rating on the remembered item and on the session's record of it", async () => {
    const res = await call({ id: "fact_knee", correct: false, reportId: "r1" });
    expect(await res.json()).toEqual({ ok: true });
    const memoryData = db.memoryUpdate.mock.calls[0][0].data;
    expect(memoryData.facts[0].correct).toBe(false);
    expect(memoryData.people[0].correct).toBeNull();
    const updates = db.reportUpdate.mock.calls[0][0].data.memoryUpdates;
    expect(updates.find((u: { id: string }) => u.id === "fact_knee").correct).toBe(false);
    expect(updates.find((u: { id: string }) => u.id === "person_dad").correct).toBeUndefined();
  });

  it("can clear a rating", async () => {
    await call({ id: "person_dad", correct: null });
    expect(db.memoryUpdate.mock.calls[0][0].data.people[0].correct).toBeNull();
  });

  it("reports not found for an unknown item and rejects bad input", async () => {
    expect(await (await call({ id: "nope", correct: true })).json()).toEqual({ ok: false });
    expect((await call({ id: "x", correct: "yes" })).status).toBe(400);
  });
});
