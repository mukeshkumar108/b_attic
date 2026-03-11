# Voice Endpoint Testing

This project now supports two ways to test voice session endpoints:

1. Normal user auth via Clerk bearer token.
2. Optional smoke-test API key mode (no short-lived bearer token race).

## 1) Automated route tests (local CI-style)

Run:

```bash
pnpm vitest run src/app/api/bluum/voice/session/routes.test.ts src/lib/auth/requireVoiceUser.test.ts
```

These tests validate request parsing, error mapping, and route contract behavior for:
- `POST /api/bluum/voice/session/start`
- `POST /api/bluum/voice/session/turn`
- `POST /api/bluum/voice/session/end`

## 2) Hosted smoke test mode (recommended for Vercel checks)

Enable these env vars in the target environment (local or Vercel):

- `VOICE_TEST_API_KEY` (strong random secret)
- `VOICE_TEST_USER_ID` (existing `User.id` in DB)

When set, requests to `/api/bluum/voice/session/*` can authenticate with header:

```http
x-voice-test-api-key: <VOICE_TEST_API_KEY>
```

Normal Clerk auth is still supported and unchanged.

### Finding `VOICE_TEST_USER_ID` locally

```bash
node -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.user.findMany({take:5,orderBy:{createdAt:"desc"},select:{id:true,clerkUserId:true}}).then(x=>console.log(x)).finally(()=>p.$disconnect())'
```

### Running hosted smoke test

Set `.env.local`:

```env
VOICE_API_BASE_URL="https://b-attic.vercel.app"
VOICE_TEST_API_KEY="<same as deployed env>"
VOICE_TEST_AUDIO_PATH="/absolute/path/to/test-audio.m4a"
VOICE_FLOW="onboarding"
VOICE_LOCALE="en-US"
VOICE_END_COMMIT=false
```

Then run:

```bash
bash scripts/voice-live-smoke.sh
```

The script performs `start -> turn -> end` and fails fast with status/body output.
