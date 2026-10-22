import { describe, expect, it } from "vitest";
import { composeModularPrompt, isModularFlow, loadFlowConstitution, MODULAR_FLOWS, stripOutputContract } from "@/lib/voice/connectPrompt";

describe("streaming flow prompts carry no output contract", () => {
  it("drops the OUTPUT FORMAT section and keeps what follows it", () => {
    const md = "## STYLE\nbe warm\n\n## OUTPUT FORMAT\nREPLY:\n[text]\n\nSTATE:\n```json\n{\"a\": 1}\n```\n\n## SAFETY\nbe careful\n";
    const out = stripOutputContract(md);
    expect(out).not.toMatch(/REPLY:|STATE:|```json|OUTPUT FORMAT/);
    expect(out).toContain("## STYLE");
    expect(out).toContain("## SAFETY\nbe careful");
  });

  it("also works when the section is the last one", () => {
    const out = stripOutputContract("## A\nx\n\n## OUTPUT FORMAT\nREPLY:\nSTATE:\n");
    expect(out).toBe("## A\nx\n\n");
  });

  it.each(["first_reflection_day0", "first_reflection_core"] as const)("%s has no REPLY/STATE/JSON format left", (flow) => {
    const prompt = loadFlowConstitution(flow);
    expect(prompt).not.toMatch(/^REPLY:/m);
    expect(prompt).not.toMatch(/^STATE:/m);
    expect(prompt).not.toMatch(/## OUTPUT FORMAT/);
    expect(prompt).not.toMatch(/```json/);
    expect(prompt).toMatch(/## SAFETY/);
    expect(prompt).toMatch(/## STYLE/);
    expect(prompt.length).toBeGreaterThan(3000);
  });
});

describe("modular flows", () => {
  it.each(MODULAR_FLOWS)("%s is the shared kernel, product knowledge, its own text and the rules, with no output contract", (flow) => {
    const prompt = loadFlowConstitution(flow);
    expect(isModularFlow(flow)).toBe(true);
    expect(prompt).toMatch(/# WHO YOU ARE/);
    expect(prompt).toMatch(/# WHAT IS IN THE APP/);
    expect(prompt).toMatch(/# RULES FOR EVERY SESSION/);
    expect(prompt).toMatch(/# SAFETY/);
    expect(prompt).not.toMatch(/REPLY:|STATE:|```json|OUTPUT FORMAT/);
    expect(prompt).toBe(composeModularPrompt(flow));
  });

  it("each flow has its own opening and closing, and none tells her to ask a closing question", () => {
    for (const flow of MODULAR_FLOWS) {
      const prompt = loadFlowConstitution(flow);
      expect(prompt).toMatch(/Opening:/);
      expect(prompt).toMatch(/Closing:[\s\S]*ask no question/i);
    }
  });

  it("the morning flow is about looking forward, the evening about one good moment, ten_things about liking themselves", () => {
    expect(loadFlowConstitution("morning")).toMatch(/looking forward to/);
    expect(loadFlowConstitution("evening")).toMatch(/take me back there/);
    expect(loadFlowConstitution("ten_things")).toMatch(/ten things they genuinely like about themselves/);
  });

  it("the old reflection prompt's never-ending relive rules are gone from every modular flow", () => {
    for (const flow of MODULAR_FLOWS) {
      const prompt = loadFlowConstitution(flow);
      expect(prompt).not.toMatch(/Do not rush to land|begins the reliving stage|Give two options|Name a few ordinary things/);
    }
  });
});

describe("openings", () => {
  it("are meant to feel like a friend dropping in: no stock how-are-you, varied, with energy", () => {
    const kernelAndRules = loadFlowConstitution("morning");
    expect(kernelAndRules).toMatch(/Never the stiff "hello, how are you/);
    expect(kernelAndRules).toMatch(/Never open two sessions the same way/);
    expect(kernelAndRules).toMatch(/start of their day whatever the time on the clock, and never say "afternoon"/);
    expect(loadFlowConstitution("daytime")).not.toMatch(/Greet them in one warm line/);
  });
});
