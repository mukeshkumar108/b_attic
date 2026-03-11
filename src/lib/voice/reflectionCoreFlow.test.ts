import { describe, expect, it } from "vitest";
import { REFLECTION_CORE_HANDSHAKE_TEXT } from "@/lib/voice/reflectionCoreFlow";

describe("reflectionCoreFlow", () => {
  it("provides core reflection handshake text", () => {
    expect(REFLECTION_CORE_HANDSHAKE_TEXT).toContain("Welcome back");
  });
});
