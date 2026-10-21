import { describe, expect, it } from "vitest";
import { loadFlowConstitution, stripOutputContract } from "@/lib/voice/connectPrompt";

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

  it.each(["onboarding", "first_reflection_day0", "first_reflection_core"] as const)("%s has no REPLY/STATE/JSON format left", (flow) => {
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
