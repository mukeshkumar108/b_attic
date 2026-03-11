#!/usr/bin/env bash
set -euo pipefail

die() {
  echo "error: $*" >&2
  exit 1
}

if ! command -v uuidgen >/dev/null 2>&1; then
  die "uuidgen is required"
fi

if ! command -v node >/dev/null 2>&1; then
  die "node is required"
fi

API_BASE="${VOICE_API_BASE_URL:-https://b-attic.vercel.app}"
FLOW="${VOICE_FLOW:-onboarding}"
LOCALE="${VOICE_LOCALE:-en-US}"
END_COMMIT="${VOICE_END_COMMIT:-false}"
TOKEN="${CLERK_TEST_BEARER_TOKEN:-}"
VOICE_TEST_API_KEY="${VOICE_TEST_API_KEY:-}"
AUDIO_PATH="${VOICE_TEST_AUDIO_PATH:-}"
TTS_VOICE_ID="${VOICE_TEST_TTS_VOICE_ID:-}"

[[ -n "$AUDIO_PATH" ]] || die "VOICE_TEST_AUDIO_PATH is required"
[[ -f "$AUDIO_PATH" ]] || die "VOICE_TEST_AUDIO_PATH file not found: $AUDIO_PATH"

if [[ -z "$TOKEN" && -z "$VOICE_TEST_API_KEY" ]]; then
  die "Set either CLERK_TEST_BEARER_TOKEN or VOICE_TEST_API_KEY"
fi

if [[ -n "$TOKEN" && -z "$VOICE_TEST_API_KEY" ]]; then
  # Validate token shape/expiry upfront to avoid confusing Clerk 404 rewrites.
  node - "$TOKEN" <<'NODE' || die "CLERK_TEST_BEARER_TOKEN is invalid or expired. Fetch a fresh token and retry."
const token = process.argv[2] || "";
const parts = token.split(".");
if (parts.length !== 3) {
  throw new Error("invalid_jwt_shape");
}
const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
if (!payload.exp) {
  throw new Error("missing_exp");
}
const nowSec = Math.floor(Date.now() / 1000);
if (payload.exp <= nowSec) {
  const expIso = new Date(payload.exp * 1000).toISOString();
  throw new Error(`expired_at_${expIso}`);
}
NODE
fi

ext="${AUDIO_PATH##*.}"
ext_lower="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
audio_mime="audio/mp4"
case "$ext_lower" in
  m4a) audio_mime="audio/x-m4a" ;;
  mp4) audio_mime="audio/mp4" ;;
  mp3) audio_mime="audio/mpeg" ;;
  wav) audio_mime="audio/wav" ;;
  webm) audio_mime="audio/webm" ;;
esac

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

client_session_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
client_turn_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
client_end_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"

start_json="$workdir/start.json"
if [[ -n "$TTS_VOICE_ID" ]]; then
  cat >"$start_json" <<EOF
{"flow":"$FLOW","clientSessionId":"$client_session_id","locale":"$LOCALE","ttsVoiceId":"$TTS_VOICE_ID"}
EOF
else
  cat >"$start_json" <<EOF
{"flow":"$FLOW","clientSessionId":"$client_session_id","locale":"$LOCALE"}
EOF
fi

echo "== Voice smoke test =="
echo "API: $API_BASE"
echo "Flow: $FLOW"
echo "Locale: $LOCALE"
echo "Audio: $AUDIO_PATH ($audio_mime)"

start_rsp="$workdir/start_rsp.json"
auth_headers=()
if [[ -n "$VOICE_TEST_API_KEY" ]]; then
  auth_headers+=("-H" "x-voice-test-api-key: $VOICE_TEST_API_KEY")
fi
if [[ -n "$TOKEN" ]]; then
  auth_headers+=("-H" "Authorization: Bearer $TOKEN")
fi

start_status="$(
  curl -sS -o "$start_rsp" -w "%{http_code}" \
    -X POST "$API_BASE/api/bluum/voice/session/start" \
    "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    --data-binary "@$start_json"
)"
echo "start status: $start_status"
cat "$start_rsp"
echo

if [[ "$start_status" -lt 200 || "$start_status" -ge 300 ]]; then
  die "start failed"
fi

session_id="$(node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(j?.session?.id ?? "")' "$start_rsp")"
[[ -n "$session_id" ]] || die "missing session.id from /start response"

turn_rsp="$workdir/turn_rsp.json"
turn_status="$(
  curl -sS -o "$turn_rsp" -w "%{http_code}" \
    -X POST "$API_BASE/api/bluum/voice/session/turn" \
    "${auth_headers[@]}" \
    -F "sessionId=$session_id" \
    -F "clientTurnId=$client_turn_id" \
    -F "audio=@$AUDIO_PATH;type=$audio_mime" \
    -F "locale=$LOCALE"
)"
echo "turn status: $turn_status"
cat "$turn_rsp"
echo

if [[ "$turn_status" -lt 200 || "$turn_status" -ge 300 ]]; then
  die "turn failed"
fi

end_reason="user_cancelled"
if [[ "$END_COMMIT" == "true" ]]; then
  end_reason="user_completed"
fi

end_json="$workdir/end.json"
cat >"$end_json" <<EOF
{"sessionId":"$session_id","clientEndId":"$client_end_id","reason":"$end_reason","commit":$END_COMMIT}
EOF

end_rsp="$workdir/end_rsp.json"
end_status="$(
  curl -sS -o "$end_rsp" -w "%{http_code}" \
    -X POST "$API_BASE/api/bluum/voice/session/end" \
    "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    --data-binary "@$end_json"
)"
echo "end status: $end_status"
cat "$end_rsp"
echo

if [[ "$end_status" -lt 200 || "$end_status" -ge 300 ]]; then
  die "end failed"
fi

echo "voice smoke test passed"
