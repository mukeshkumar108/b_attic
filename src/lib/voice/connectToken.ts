import { createHmac, timingSafeEqual } from "crypto";

export const VOICE_CONNECT_FLOWS = [
  "onboarding",
  "first_reflection_day0",
  "first_reflection_core",
  "voice_demo",
] as const;
export type VoiceConnectFlow = (typeof VOICE_CONNECT_FLOWS)[number];

export const VOICE_TOKEN_TTL_SEC = 300;

/**
 * Short-lived claims that identify who is connecting to the voice service and for which
 * flow. The token carries identity only; the prompt is fetched server to server.
 */
export interface VoiceConnectClaims {
  v: 1;
  sid: string;
  uid: string;
  pid: "bloom";
  flow: VoiceConnectFlow;
  tz: string;
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
  nowSec: number = Math.floor(Date.now() / 1000)
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
  if (claims.v !== 1 || claims.pid !== "bloom") return null;
  if (!VOICE_CONNECT_FLOWS.includes(claims.flow)) return null;
  if (typeof claims.uid !== "string" || !claims.uid) return null;
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
  return claims;
}
