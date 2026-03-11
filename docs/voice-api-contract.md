# Bluum Voice API Contract (MVP)

Status: Draft for backend + React Native integration
Last updated: 2026-03-11

This document defines the canonical contract for turn-based push-to-talk voice flow:

STT (Lemonfox) -> LLM (OpenRouter) -> TTS (ElevenLabs)

Supported flows:
- `onboarding`
- `first_reflection`

All endpoints require the same auth behavior as existing Bluum APIs (`requireUser()` via Clerk session or bearer).

Base URL: `http://localhost:3000/api/bluum/voice/session`

## Design decisions (final)

- Audio response format for turns: `assistant.audioUrl` (preferred and final for MVP)
- `assistant.audio.base64`: not returned in MVP
- TTS failure fallback: response is still `200`; `assistant.audioUrl` may be `null` with text-only playback fallback
- Completion flag: `readyToEnd` only
- Canonical non-2xx error envelope:

```json
{
  "error": {
    "code": "stt_unintelligible",
    "message": "Could not understand speech. Please try again.",
    "retryable": true
  }
}
```

- Duplicate `clientTurnId` behavior:
- Same payload hash: return `200` and replay full previously stored response
- Different payload hash: return `409` with `error.code = "idempotency_conflict"`
- Duplicate `clientSessionId` behavior for `/start`:
- Same normalized request (`flow`, `dateLocal`, `locale`, `ttsVoiceId`): return `200` and replay full previously stored response
- Different normalized request for same `clientSessionId` (including different `flow`): return `409` with `error.code = "idempotency_conflict"`
- Duplicate `clientEndId` behavior for `/end`: return `200` and replay full previously stored response (identical payload)
- Session TTL: 20 minutes
- TTL extension: sliding on each successful `/turn` (`expiresAt = now + 20m`)
- Expired session error: `409` with `error.code = "session_expired"`
- Audio URL validity for all assistant responses: minimum `10 minutes` from response timestamp (`audioExpiresAt`)
- If `/turn` returns `ttsAvailable=false`, the turn is still successful (`200`) and the session continues normally
- For `first_reflection`, `/end` with `commit=false` ends the session without writing `DailyReflection` and without mutating streak state
- Recommended default client behavior for `/turn`: staged flow (`responseMode=staged` then `responseMode=finalize`) for lower perceived latency
- Compatibility fallback remains available: single-call `responseMode=final` (or omitted `responseMode`)

## Endpoints

### POST /start

Start a new voice session and lock the flow for that session.

Request body:

```json
{
  "flow": "first_reflection",
  "clientSessionId": "8f131fd3-a0f5-4e73-bfdd-73dc8ec67b61",
  "dateLocal": "2026-03-10",
  "locale": "en-US",
  "ttsVoiceId": "optional-voice-id"
}
```

Fields:
- `flow` required, enum: `onboarding | first_reflection`
- `clientSessionId` required (UUID, idempotency key)
- `dateLocal` optional (`YYYY-MM-DD`, mainly for `first_reflection`)
- `locale` optional
- `ttsVoiceId` optional

Success response (`201`, or `200` on idempotent replay):

```json
{
  "session": {
    "id": "vsn_123",
    "flow": "first_reflection",
    "state": "active",
    "dateLocal": "2026-03-10",
    "expiresAt": "2026-03-10T10:20:00.000Z",
    "nextTurnIndex": 1,
    "readyToEnd": false
  },
  "assistant": {
    "text": "Opening prompt/question",
    "audioUrl": "https://cdn.example.com/voice/vsn_123/opening.mp3",
    "audioMimeType": "audio/mpeg",
    "audioExpiresAt": "2026-03-10T10:15:00.000Z",
    "ttsAvailable": true
  }
}
```

Common errors:
- `400` invalid request
- `401` unauthorized
- `409` idempotency conflict (`clientSessionId` reused with different request shape)
- `409` reflection already exists for date (`first_reflection`)
- `500` internal

### POST /turn (multipart/form-data)

Submit one user push-to-talk clip and get one assistant response.

Content-Type:
- `multipart/form-data`

Multipart field spec:
- `sessionId` (string, required)
- `clientTurnId` (string UUID, required, idempotency key)
- `audio` (file, required for `responseMode=final|staged`; omitted for `responseMode=finalize`)
- `responseMode` (string, optional, enum: `final | staged | finalize`, default: `final`)
- `audioDurationMs` (number, optional)
- `locale` (string, optional)
- `deviceTs` (string ISO-8601, optional)

Audio constraints (MVP):
- max file size: `2 MB`
- max duration: `90,000 ms` (90 seconds)
- accepted MIME types:
- `audio/mp4`
- `audio/x-m4a`
- `audio/mpeg`
- `audio/wav`
- `audio/webm`

Success response (`200`) for `responseMode=final`:

```json
{
  "session": {
    "id": "vsn_123",
    "state": "active",
    "readyToEnd": false,
    "safetyFlagged": false,
    "nextTurnIndex": 2,
    "expiresAt": "2026-03-10T10:25:00.000Z"
  },
  "turn": {
    "id": "vturn_456",
    "index": 1,
    "clientTurnId": "8c80f6b5-4e48-4ed2-922c-3f5f24b563f4",
    "userTranscript": {
      "text": "I am grateful for my sister calling me today."
    },
    "assistant": {
      "text": "That sounds meaningful. What part of that call stayed with you most?",
      "audioUrl": "https://cdn.example.com/voice/vturn_456.mp3",
      "audioMimeType": "audio/mpeg",
      "audioExpiresAt": "2026-03-10T10:15:00.000Z",
      "ttsAvailable": true
    },
    "safety": {
      "flagged": false,
      "reason": "none",
      "safeResponse": null
    }
  }
}
```

Success response (`200`) for `responseMode=staged` (pending shape):

```json
{
  "session": {
    "id": "vsn_123",
    "state": "active",
    "readyToEnd": false,
    "safetyFlagged": false,
    "nextTurnIndex": 2,
    "expiresAt": "2026-03-10T10:25:00.000Z"
  },
  "turn": {
    "id": "vturn_456",
    "index": 1,
    "clientTurnId": "8c80f6b5-4e48-4ed2-922c-3f5f24b563f4",
    "userTranscript": {
      "text": "I am grateful for my sister calling me today."
    },
    "assistantPending": true
  }
}
```

Pending-shape guarantees:
- `turn.userTranscript.text` is always present
- `turn.assistantPending` is always `true`
- `turn.assistant` is omitted in pending response

Finalize call contract:
- Use same endpoint: `POST /turn` with `multipart/form-data`
- Use same `sessionId` and same `clientTurnId` from prior staged call
- Set `responseMode=finalize`
- Do not include `audio` field
- On success (`200`), response payload matches the normal final turn payload shape

`assistant` audio schema (exact, all turn/start success responses):
- `text`: `string` (required)
- `audioUrl`: `string | null`
- `audioMimeType`: `string | null`
- `audioExpiresAt`: `string | null` (ISO-8601 when present)
- `ttsAvailable`: `boolean` (required)

Safety-flagged turn behavior:
- `safety.flagged = true`
- `safety.safeResponse` is always present and includes resources
- `session.readyToEnd = true` always

`safeResponse` schema (exact):

```json
{
  "message": "It sounds like you might be going through a difficult time...",
  "resources": [
    { "label": "US - 988 Suicide & Crisis Lifeline", "value": "Call or text 988" },
    { "label": "UK - Samaritans", "value": "Call 116 123 (free, 24/7)" },
    { "label": "International", "value": "Contact your local emergency services" },
    { "label": "Crisis Text Line (US)", "value": "Text HOME to 741741" }
  ]
}
```

Resource item schema (exact):
- `label` string, required
- `value` string, required

TTS-failure turn behavior:
- Request still succeeds with `200`
- `assistant.text` is always present
- `assistant.audioUrl = null`
- `assistant.audioMimeType = null`
- `assistant.audioExpiresAt = null`
- `assistant.ttsAvailable = false`

### POST /end

End a session and commit final persistence for that flow.

Request body:

```json
{
  "sessionId": "vsn_123",
  "clientEndId": "847ce4eb-f8d3-48f1-bf03-6e4bad6f4b74",
  "reason": "user_completed",
  "commit": true
}
```

Fields:
- `sessionId` required
- `clientEndId` required (UUID, idempotency)
- `reason` optional (`user_completed | user_cancelled | timeout | safety_stop`)
- `commit` optional, default true

`commit` behavior:
- `commit=true` (default): persist final flow outcome (reflection for `first_reflection`, profile updates for `onboarding`)
- `commit=false`: end/discard session only; for `first_reflection` specifically, no reflection write and no streak mutation

Idempotency behavior:
- Duplicate `clientEndId` with same normalized request returns `200` and replays the exact prior response payload
- Duplicate `clientEndId` with different normalized request returns `409` with `error.code = "idempotency_conflict"`

Success response for `first_reflection` (`200`):

Returns the same reflection payload fields as existing text flow.

```json
{
  "session": {
    "id": "vsn_123",
    "flow": "first_reflection",
    "state": "ended",
    "endedAt": "2026-03-10T10:07:40.000Z"
  },
  "result": {
    "reflection": {
      "saved": true,
      "safetyFlagged": false,
      "coach": {
        "type": "validate",
        "text": "Being seen when you needed it matters."
      },
      "successMessage": "Nice work taking a moment to reflect today."
    },
    "onboarding": null
  }
}
```

Safety-flagged completion (first_reflection) still uses the existing text flow shape:
- `saved`
- `safetyFlagged`
- `safeResponse`
- `coach: null`
- `successMessage: null`

Success response for `onboarding` (`200`):

Returns a separate onboarding object with updated profile summary.
This onboarding result shape is final/stable for MVP (future changes will be additive only).

```json
{
  "session": {
    "id": "vsn_999",
    "flow": "onboarding",
    "state": "ended",
    "endedAt": "2026-03-10T10:12:00.000Z"
  },
  "result": {
    "reflection": null,
    "onboarding": {
      "completed": true,
      "user": {
        "id": "cuid_123",
        "displayName": "Alex",
        "timezone": "America/New_York",
        "onboardingCompleted": true,
        "reflectionReminderEnabled": true,
        "reflectionReminderTimeLocal": "20:00"
      }
    }
  }
}
```

## Canonical non-2xx errors

All non-2xx responses must use:

```json
{
  "error": {
    "code": "<machine_code>",
    "message": "<human readable>",
    "retryable": true
  }
}
```

Recommended error codes:
- `unauthorized` (`401`, retryable false)
- `validation_error` (`400`, retryable false)
- `unsupported_media_type` (`415`, retryable false)
- `audio_too_large` (`413`, retryable false)
- `audio_too_long` (`400`, retryable false)
- `stt_unintelligible` (`422`, retryable true)
- `stt_provider_error` (`503`, retryable true)
- `llm_provider_error` (`503`, retryable true)
- `tts_provider_error` (`503`, retryable true)
- `turn_not_found` (`404`, retryable false)
- `turn_pending_finalize` (`409`, retryable false)
- `turn_finalize_in_progress` (`409`, retryable true)
- `session_not_found` (`404`, retryable false)
- `session_expired` (`409`, retryable false)
- `session_inactive` (`409`, retryable false)
- `idempotency_conflict` (`409`, retryable false)
- `reflection_exists` (`409`, retryable false)
- `rate_limited` (`429`, retryable true)
- `internal_error` (`500`, retryable true)

## Sample payloads requested

### 1) Happy path turn (`200`)

```json
{
  "session": {
    "id": "vsn_123",
    "state": "active",
    "readyToEnd": false,
    "safetyFlagged": false,
    "nextTurnIndex": 2,
    "expiresAt": "2026-03-10T10:25:00.000Z"
  },
  "turn": {
    "id": "vturn_456",
    "index": 1,
    "clientTurnId": "8c80f6b5-4e48-4ed2-922c-3f5f24b563f4",
    "userTranscript": {
      "text": "I am grateful for my sister calling me today."
    },
    "assistant": {
      "text": "That sounds meaningful. What part of that call stayed with you most?",
      "audioUrl": "https://cdn.example.com/voice/vturn_456.mp3",
      "audioMimeType": "audio/mpeg",
      "audioExpiresAt": "2026-03-10T10:15:00.000Z",
      "ttsAvailable": true
    },
    "safety": {
      "flagged": false,
      "reason": "none",
      "safeResponse": null
    }
  }
}
```

### 2) STT unintelligible (`422`)

```json
{
  "error": {
    "code": "stt_unintelligible",
    "message": "Could not understand speech. Please try again.",
    "retryable": true
  }
}
```

### 3) STT provider error (`503`)

```json
{
  "error": {
    "code": "stt_provider_error",
    "message": "Speech service temporarily unavailable.",
    "retryable": true
  }
}
```

## Frontend behavior checklist (React Native)

- Start once with `/start`, then keep using returned `session.id`
- For each push-to-talk clip, default to staged sequence:
- first call `/turn` with `responseMode=staged` + audio
- render `turn.userTranscript.text` immediately when `assistantPending=true`
- then call `/turn` with same `sessionId + clientTurnId` and `responseMode=finalize` (no audio)
- Always branch on `readyToEnd`
- If `readyToEnd=true`, call `/end`
- If `stt_unintelligible`, prompt re-record in same session
- If `session_expired`, start a new session
- If safety flagged, show `safeResponse` resources immediately and end flow
- If `turn_finalize_in_progress`, retry finalize with short backoff
- Compatibility fallback: client may use `responseMode=final` if staged path is unavailable

## V2 deferrals (not MVP)

- Streaming partial transcripts and streaming TTS
- Base64 audio inline transport
- Automatic provider failover trees
- Multi-clip batching per turn
