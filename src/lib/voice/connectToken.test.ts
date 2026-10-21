import { describe, expect, it } from "vitest";
import { signVoiceToken, verifyVoiceToken, type VoiceConnectClaims } from "@/lib/voice/connectToken";

const claims: VoiceConnectClaims = {
  v: 1,
  sid: "sess_1",
  uid: "user_1",
  pid: "bloom",
  flow: "first_reflection_core",
  tz: "Europe/London",
  iat: 1000,
  exp: 1300,
};

describe("voice connect token", () => {
  it("round trips valid claims", () => {
    const token = signVoiceToken(claims, "secret");
    expect(verifyVoiceToken(token, "secret", 1100)).toEqual(claims);
  });

  it("rejects expired tokens", () => {
    expect(verifyVoiceToken(signVoiceToken(claims, "secret"), "secret", 1300)).toBeNull();
  });

  it("rejects a wrong secret and tampered claims", () => {
    const token = signVoiceToken(claims, "secret");
    expect(verifyVoiceToken(token, "other", 1100)).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, uid: "user_2" })).toString("base64url");
    expect(verifyVoiceToken(`${forged}.${sig}`, "secret", 1100)).toBeNull();
    expect(verifyVoiceToken(`${body}.x`, "secret", 1100)).toBeNull();
  });

  it("rejects unknown product or flow", () => {
    const bad = signVoiceToken({ ...claims, flow: "nope" as never }, "secret");
    expect(verifyVoiceToken(bad, "secret", 1100)).toBeNull();
  });
});
