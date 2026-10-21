import { describe, expect, it } from "vitest";
import {
  claimsFromBearer,
  signVoiceToken,
  verifyVoiceToken,
  type VoiceConnectClaims,
} from "@/lib/voice/connectToken";

const claims: VoiceConnectClaims = {
  uid: "user_1",
  cid: "conv_1",
  tz: "Europe/London",
  companion: "bloom",
  flow: "first_reflection_core",
  host: "https://b-attic.example",
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

  it("rejects unknown companion or flow", () => {
    expect(verifyVoiceToken(signVoiceToken({ ...claims, flow: "nope" as never }, "secret"), "secret", 1100)).toBeNull();
    expect(verifyVoiceToken(signVoiceToken({ ...claims, companion: "sophie" as never }, "secret"), "secret", 1100)).toBeNull();
  });

  it("reads a bearer header", () => {
    const token = signVoiceToken({ ...claims, exp: Math.floor(Date.now() / 1000) + 60 }, "secret");
    expect(claimsFromBearer(`Bearer ${token}`, "secret")?.uid).toBe("user_1");
    expect(claimsFromBearer(token, "secret")).toBeNull();
    expect(claimsFromBearer(null, "secret")).toBeNull();
  });
});
