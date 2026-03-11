import { describe, expect, it } from "vitest";
import {
  REFLECTION_CORE_HANDSHAKE_TEXT,
  sanitizeReflectionCoreReplyForSpeech,
} from "@/lib/voice/reflectionCoreFlow";

describe("reflectionCoreFlow", () => {
  it("provides core reflection handshake text", () => {
    expect(REFLECTION_CORE_HANDSHAKE_TEXT).toContain("Welcome back");
  });

  it("strips STATE blocks with json{...} marker from speakable reply", () => {
    const raw =
      "Love that. Stay with that feeling for a moment.\n\nSTATE:\njson{\n  \"stage\":\"explore\",\n  \"moment_detected\":true,\n  \"session_complete\":false,\n  \"safety_flag\":false\n}";

    expect(sanitizeReflectionCoreReplyForSpeech(raw)).toBe(
      "Love that. Stay with that feeling for a moment."
    );
  });
});
