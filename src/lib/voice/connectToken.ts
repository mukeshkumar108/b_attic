import { createHmac, timingSafeEqual } from "crypto";

export const VOICE_CONNECT_FLOWS = [
  "onboarding",
  "morning",
  "daytime",
  "evening",
  "ten_things",
  // earlier flows, still accepted so existing clients keep working
  "first_reflection_day0",
  "first_reflection_core",
  "voice_demo",
] as const;
export type VoiceConnectFlow = (typeof VOICE_CONNECT_FLOWS)[number];

export const VOICE_TOKEN_TTL_SEC = 300;

/**
 * Short-lived claims, in the format the voice server verifies (HMAC-SHA256 over the base64url
 * payload). `cid` is the call's conversation id, `companion` the Runtime companion, and `host`
 * tells the voice server which product host to call back (it must be allow-listed there).
 */
export interface VoiceConnectClaims {
  uid: string;
  cid: string;
  tz: string;
  companion: "bloom";
  flow: VoiceConnectFlow;
  host: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signVoiceToken(claims: VoiceConnectClaims, secret: string): string {
  const body = b64url(JSON.stringify(claims));
  return `${body}.${sign(body, secret)}`;
}

export function verifyVoiceToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  graceSec = 0
): VoiceConnectClaims | null {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(body, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  let claims: VoiceConnectClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (claims.companion !== "bloom") return null;
  if (!VOICE_CONNECT_FLOWS.includes(claims.flow)) return null;
  if (typeof claims.uid !== "string" || !claims.uid) return null;
  if (typeof claims.cid !== "string" || !claims.cid) return null;
  if (typeof claims.exp !== "number" || claims.exp + graceSec <= nowSec) return null;
  return claims;
}

/** Reads and verifies the `Authorization: Bearer <token>` the voice server sends back. */
export function claimsFromBearer(
  authorization: string | null,
  secret: string,
  graceSec = 0
): VoiceConnectClaims | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  return match ? verifyVoiceToken(match[1].trim(), secret, Math.floor(Date.now() / 1000), graceSec) : null;
}
