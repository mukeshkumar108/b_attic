import { describe, expect, it } from "vitest";
import { FIRST_REFLECTION_DAY0_HANDSHAKE_TEXT } from "@/lib/voice/firstReflectionDay0Flow";

describe("firstReflectionDay0Flow", () => {
  it("provides day0 reflection handshake text", () => {
    expect(FIRST_REFLECTION_DAY0_HANDSHAKE_TEXT).toContain(
      "first reflection"
    );
  });
});
