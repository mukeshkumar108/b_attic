/**
 * Per-person memory, rolled up from what each Bloom session's analysis extracts. The model only
 * proposes small updates (a delta); matching, ids, counts, dates and expiry are decided here so
 * duplicates and runaway growth are handled in plain code.
 */

/** A call's token stays valid this long after it expires, so a long call can still report. */
export const REPORT_GRACE_SEC = 3 * 60 * 60;

export type Sensitivity = "nominal" | "sensitive";
export type ThreadStatus = "open" | "followed_up" | "resolved" | "expired";

interface Traced {
  id: string;
  sensitivity: Sensitivity;
  basis: string; // paraphrase of why this was extracted, never a verbatim quote
  source: string; // conversation id that last touched it
  correct: boolean | null; // set by a reviewer in the research view
}

export interface Person extends Traced {
  name: string;
  relation: string;
  meaning: string;
  firstMentioned: string;
  lastMentioned: string;
  count: number;
}
export interface Theme extends Traced {
  label: string;
  firstMentioned: string;
  lastMentioned: string;
  count: number;
}
export interface Fact extends Traced {
  fact: string;
  category: string;
  createdAt: string;
  expiresAt: string;
}
export interface Thread extends Traced {
  topic: string;
  status: ThreadStatus;
  notBefore: string;
  expiresAt: string;
  suggestedCheckin: string;
  createdAt: string;
}
export interface MemoryState {
  people: Person[];
  themes: Theme[];
  facts: Fact[];
  openThreads: Thread[];
  style: { notes: string[]; lastDirective?: LastDirective };
}

/** What the last session start told Bloom, so the report can record which rules were active. */
export interface LastDirective {
  conversationId: string;
  ruleVersion: string;
  applied: string[];
  at: string;
}

export interface MemoryDelta {
  people?: { ref?: string; name: string; relation?: string; meaning?: string; sensitivity?: Sensitivity; basis?: string }[];
  themes?: { label: string; sensitivity?: Sensitivity; basis?: string }[];
  facts?: { fact: string; category?: string; sensitivity?: Sensitivity; expiresInDays?: number; basis?: string }[];
  threads?: {
    ref?: string;
    topic: string;
    status?: ThreadStatus;
    notBeforeDays?: number;
    expiresInDays?: number;
    suggestedCheckin?: string;
    sensitivity?: Sensitivity;
    basis?: string;
  }[];
  style?: { notes?: string[] };
}

export const EMPTY_MEMORY: MemoryState = { people: [], themes: [], facts: [], openThreads: [], style: { notes: [] } };

const CAP = { people: 50, themes: 30, facts: 60, openThreads: 40, notes: 10 };
const DEFAULT_FACT_DAYS = { nominal: 45, sensitive: 14 };
const DEFAULT_THREAD_DAYS = { nominal: 7, sensitive: 4 };
const DAY_MS = 24 * 60 * 60 * 1000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s: string) => norm(s).replace(/ /g, "_").slice(0, 32) || "item";
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const sens = (s: unknown): Sensitivity => (s === "sensitive" ? "sensitive" : "nominal");
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS).toISOString();

export function asMemoryState(raw: Partial<Record<keyof MemoryState, unknown>> | null | undefined): MemoryState {
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const style = raw?.style as { notes?: unknown } | undefined;
  return {
    people: list<Person>(raw?.people),
    themes: list<Theme>(raw?.themes),
    facts: list<Fact>(raw?.facts),
    openThreads: list<Thread>(raw?.openThreads),
    style: { ...(style as object), notes: list<string>(style?.notes) } as MemoryState["style"],
  };
}

/** Marks threads past their expiry. Pure; applied on read and before every merge. */
export function expireThreads(state: MemoryState, now: Date): MemoryState {
  return {
    ...state,
    openThreads: state.openThreads.map((t) =>
      (t.status === "open" || t.status === "followed_up") && new Date(t.expiresAt) <= now ? { ...t, status: "expired" } : t
    ),
  };
}

export interface MergeResult {
  memory: MemoryState;
  applied: { kind: "person" | "theme" | "fact" | "thread" | "style"; id: string; action: "added" | "updated"; basis: string }[];
}

export function mergeMemory(existing: MemoryState, delta: MemoryDelta, conversationId: string, now: Date = new Date()): MergeResult {
  const state = expireThreads(structuredClone(existing), now);
  const applied: MergeResult["applied"] = [];
  const iso = now.toISOString();
  const basisOf = (b?: string) => (b ?? "").slice(0, 200);

  for (const p of delta.people ?? []) {
    if (!p?.name?.trim()) continue;
    const hit = state.people.find((x) => x.id === p.ref || norm(x.name) === norm(p.name));
    const sensitivity = sens(p.sensitivity);
    if (hit) {
      hit.count += 1;
      hit.lastMentioned = iso;
      hit.source = conversationId;
      if (p.relation?.trim()) hit.relation = p.relation.trim();
      if (p.meaning?.trim()) hit.meaning = p.meaning.trim();
      if (sensitivity === "sensitive") hit.sensitivity = "sensitive";
      if (p.basis) hit.basis = basisOf(p.basis);
      applied.push({ kind: "person", id: hit.id, action: "updated", basis: hit.basis });
    } else {
      const id = `person_${slug(p.name)}`;
      state.people.push({
        id, name: p.name.trim(), relation: p.relation?.trim() ?? "", meaning: p.meaning?.trim() ?? "", sensitivity,
        basis: basisOf(p.basis), source: conversationId, correct: null, firstMentioned: iso, lastMentioned: iso, count: 1,
      });
      applied.push({ kind: "person", id, action: "added", basis: basisOf(p.basis) });
    }
  }

  for (const t of delta.themes ?? []) {
    if (!t?.label?.trim()) continue;
    const hit = state.themes.find((x) => norm(x.label) === norm(t.label));
    if (hit) {
      hit.count += 1;
      hit.lastMentioned = iso;
      hit.source = conversationId;
      applied.push({ kind: "theme", id: hit.id, action: "updated", basis: hit.basis });
    } else {
      const id = `theme_${slug(t.label)}`;
      state.themes.push({
        id, label: t.label.trim(), sensitivity: sens(t.sensitivity), basis: basisOf(t.basis), source: conversationId,
        correct: null, firstMentioned: iso, lastMentioned: iso, count: 1,
      });
      applied.push({ kind: "theme", id, action: "added", basis: basisOf(t.basis) });
    }
  }

  for (const f of delta.facts ?? []) {
    if (!f?.fact?.trim()) continue;
    const sensitivity = sens(f.sensitivity);
    const days = f.expiresInDays && f.expiresInDays > 0 ? f.expiresInDays : DEFAULT_FACT_DAYS[sensitivity];
    const hit = state.facts.find((x) => norm(x.fact) === norm(f.fact));
    if (hit) {
      hit.expiresAt = addDays(now, days);
      hit.source = conversationId;
      applied.push({ kind: "fact", id: hit.id, action: "updated", basis: hit.basis });
    } else {
      const id = `fact_${slug(f.fact)}_${day(now)}`;
      state.facts.push({
        id, fact: f.fact.trim(), category: f.category?.trim() || "general", sensitivity, basis: basisOf(f.basis),
        source: conversationId, correct: null, createdAt: iso, expiresAt: addDays(now, days),
      });
      applied.push({ kind: "fact", id, action: "added", basis: basisOf(f.basis) });
    }
  }

  for (const t of delta.threads ?? []) {
    if (!t?.topic?.trim() && !t?.ref) continue;
    const hit = state.openThreads.find((x) => x.id === t.ref || (t.topic && norm(x.topic) === norm(t.topic)));
    if (hit) {
      if (t.status) hit.status = t.status;
      if (t.expiresInDays && t.expiresInDays > 0) hit.expiresAt = addDays(now, t.expiresInDays);
      if (t.suggestedCheckin?.trim()) hit.suggestedCheckin = t.suggestedCheckin.trim();
      hit.source = conversationId;
      applied.push({ kind: "thread", id: hit.id, action: "updated", basis: hit.basis });
    } else if (t.topic?.trim()) {
      const sensitivity = sens(t.sensitivity);
      const id = `thread_${slug(t.topic)}_${day(now)}`;
      const notBefore = addDays(now, Math.max(0, t.notBeforeDays ?? 1));
      state.openThreads.push({
        id, topic: t.topic.trim(), status: t.status ?? "open", sensitivity, basis: basisOf(t.basis), source: conversationId,
        correct: null, notBefore, createdAt: iso,
        expiresAt: addDays(now, t.expiresInDays && t.expiresInDays > 0 ? t.expiresInDays : DEFAULT_THREAD_DAYS[sensitivity]),
        suggestedCheckin: t.suggestedCheckin?.trim() ?? "",
      });
      applied.push({ kind: "thread", id, action: "added", basis: basisOf(t.basis) });
    }
  }

  for (const note of delta.style?.notes ?? []) {
    const n = note?.trim();
    if (n && !state.style.notes.some((x) => norm(x) === norm(n))) {
      state.style.notes.push(n.slice(0, 160));
      applied.push({ kind: "style", id: `style_${slug(n)}`, action: "added", basis: "" });
    }
  }

  const newest = <T extends { lastMentioned: string }>(a: T, b: T) => b.lastMentioned.localeCompare(a.lastMentioned);
  state.people = state.people.sort(newest).slice(0, CAP.people);
  state.themes = state.themes.sort(newest).slice(0, CAP.themes);
  state.facts = state.facts.filter((f) => new Date(f.expiresAt) > now).slice(-CAP.facts);
  state.openThreads = state.openThreads.slice(-CAP.openThreads);
  state.style.notes = state.style.notes.slice(-CAP.notes);
  return { memory: state, applied };
}

/** Threads that may be raised now: open, past notBefore, not expired. Sensitive ones are never proactive. */
export function dueThreads(state: MemoryState, now: Date = new Date()): Thread[] {
  return expireThreads(state, now).openThreads.filter(
    (t) => t.status === "open" && new Date(t.notBefore) <= now && new Date(t.expiresAt) > now && t.sensitivity === "nominal"
  );
}
