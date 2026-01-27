# Bluum API Documentation

All endpoints require authentication via Clerk session cookie (`__session`).

Base URL: `http://localhost:3000/api/bluum`

---

## User & Onboarding

### GET /me

Get current user profile.

**Response:**
```json
{
  "user": {
    "id": "cuid...",
    "displayName": "Alex",
    "timezone": "America/New_York",
    "onboardingCompleted": true,
    "reflectionReminderEnabled": true,
    "reflectionReminderTimeLocal": "20:00"
  }
}
```

**curl:**
```bash
curl -X GET http://localhost:3000/api/bluum/me \
  -H "Cookie: __session=<token>"
```

---

### POST /onboarding

Complete user onboarding.

**Request Body:**
```json
{
  "displayName": "Alex",
  "timezone": "America/New_York",
  "reflectionReminderEnabled": true,
  "reflectionReminderTimeLocal": "20:00"
}
```

**Validation:**
- `displayName`: required, 1-50 characters
- `timezone`: optional, IANA format (e.g., "America/New_York")
- `reflectionReminderEnabled`: optional, boolean
- `reflectionReminderTimeLocal`: required if reminders enabled, format "HH:MM"

**Response:** Same as GET /me

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/onboarding \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=<token>" \
  -d '{"displayName": "Alex", "timezone": "America/New_York"}'
```

---

## Daily Flow

### GET /today

Get today's status and prompt.

**Query Parameters:**
- `dateLocal` (optional): Override date in YYYY-MM-DD format

**Response:**
```json
{
  "dateLocal": "2024-03-15",
  "onboardingCompleted": true,
  "hasReflected": false,
  "hasMood": false,
  "prompt": {
    "id": "p01",
    "text": "Who made you smile today, and what did they do?"
  },
  "didSwapPrompt": false,
  "primaryCta": "reflect"
}
```

**curl:**
```bash
curl -X GET "http://localhost:3000/api/bluum/today" \
  -H "Cookie: __session=<token>"
```

---

### POST /prompt/swap

Swap today's prompt (max 1 per day).

**Request Body:**
```json
{
  "dateLocal": "2024-03-15"  // optional
}
```

**Response:**
```json
{
  "prompt": {
    "id": "m01",
    "text": "What small moment today brought you peace or joy?"
  },
  "didSwapPrompt": true
}
```

**Error Codes:**
- 409: Already swapped today or reflection already submitted

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/prompt/swap \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=<token>" \
  -d '{}'
```

---

## Reflection

### POST /reflection

Submit a gratitude reflection.

**Request Body:**
```json
{
  "dateLocal": "2024-03-15",  // optional
  "responseText": "My coworker Sarah noticed I was stressed..."
}
```

**Validation:**
- `responseText`: required, 1-2000 characters

**Response (normal):**
```json
{
  "saved": true,
  "safetyFlagged": false,
  "coach": {
    "type": "validate",
    "text": "Being seen when you need it most is a real gift."
  },
  "successMessage": "Nice work taking a moment to reflect today."
}
```

**Response (safety flagged):**
```json
{
  "saved": true,
  "safetyFlagged": true,
  "safeResponse": {
    "message": "It sounds like you might be going through a difficult time...",
    "resources": [
      { "label": "US - 988 Suicide & Crisis Lifeline", "value": "Call or text 988" },
      { "label": "UK - Samaritans", "value": "Call 116 123 (free, 24/7)" },
      { "label": "International", "value": "Contact your local emergency services" },
      { "label": "Crisis Text Line (US)", "value": "Text HOME to 741741" }
    ]
  },
  "coach": null,
  "successMessage": null
}
```

**Error Codes:**
- 409: Reflection already exists for this date

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/reflection \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=<token>" \
  -d '{"responseText": "I am grateful for my morning coffee."}'
```

---

### POST /reflection/addendum

Add an addendum to today's reflection.

**Request Body:**
```json
{
  "dateLocal": "2024-03-15",  // optional
  "text": "I also wanted to mention..."
}
```

**Validation:**
- `text`: required, 1-400 characters
- Must be same day as current date (user's timezone)
- Reflection must exist
- Only one addendum per day

**Response:**
```json
{
  "saved": true
}
```

**Error Codes:**
- 400: Not same day, or no reflection exists
- 409: Addendum already exists

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/reflection/addendum \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=<token>" \
  -d '{"text": "And the tea was chamomile, my favorite."}'
```

---

## Mood

### POST /mood

Log daily mood (upsert).

**Request Body:**
```json
{
  "dateLocal": "2024-03-15",  // optional
  "rating": 4,
  "tags": ["calm", "grateful"],  // optional, max 5
  "note": "Good day overall"  // optional, max 200 chars
}
```

**Validation:**
- `rating`: required, integer 1-5
- `tags`: optional, max 5 strings
- `note`: optional, max 200 characters

**Response:**
```json
{
  "saved": true
}
```

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/mood \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=<token>" \
  -d '{"rating": 4, "tags": ["calm"]}'
```

---

## Moments

### POST /moment

Create a gratitude moment (quick capture).

**Request Body:**
```json
{
  "text": "Beautiful sunset today",  // optional, max 280 chars
  "imageUrl": "https://..."  // optional, valid URL
}
```

**Validation:**
- At least one of `text` or `imageUrl` required
- `text`: max 280 characters
- `imageUrl`: valid URL format

**Response:**
```json
{
  "saved": true,
  "id": "cuid..."
}
```

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/moment \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=<token>" \
  -d '{"text": "Beautiful sunset today"}'
```

---

### GET /moments

List gratitude moments with cursor pagination.

**Query Parameters:**
- `limit` (optional): 1-100, default 20
- `cursor` (optional): Cursor for pagination (moment ID)
- `q` (optional): Search query (text contains, case-insensitive)

**Response:**
```json
{
  "items": [
    {
      "id": "cuid...",
      "text": "Beautiful sunset",
      "imageUrl": null,
      "createdAt": "2024-03-15T18:30:00.000Z"
    }
  ],
  "nextCursor": "cuid..." // null if no more pages
}
```

**curl:**
```bash
curl -X GET "http://localhost:3000/api/bluum/moments?limit=10" \
  -H "Cookie: __session=<token>"
```

---

### POST /moment/upload-url

Generate a signed upload URL for moment images.

**Response:**
```json
{
  "uploadUrl": "https://...",
  "publicUrl": "https://..."
}
```

**Note:** This endpoint uses Vercel Blob storage.

**curl:**
```bash
curl -X POST http://localhost:3000/api/bluum/moment/upload-url \
  -H "Cookie: __session=<token>"
```

---

## Statistics

### GET /streaks

Get streak statistics.

**Query Parameters:**
- `dateLocal` (optional): Reference date in YYYY-MM-DD format

**Response:**
```json
{
  "dateLocal": "2024-03-15",
  "currentStreak": 7,
  "longestStreak": 21,
  "totalReflections": 45
}
```

**curl:**
```bash
curl -X GET "http://localhost:3000/api/bluum/streaks" \
  -H "Cookie: __session=<token>"
```

---

### GET /summaries

List user summaries (weekly/monthly).

**Query Parameters:**
- `type` (optional): "weekly" or "monthly"
- `limit` (optional): 1-50, default 12

**Response:**
```json
{
  "items": [
    {
      "id": "cuid...",
      "periodType": "WEEKLY",
      "periodStartLocal": "2024-03-11",
      "periodEndLocal": "2024-03-17",
      "summaryText": "This week you focused on...",
      "createdAt": "2024-03-18T00:00:00.000Z"
    }
  ]
}
```

**Note:** Returns empty array if no summaries exist. Summary generation is not implemented in v1.

**curl:**
```bash
curl -X GET "http://localhost:3000/api/bluum/summaries?type=weekly" \
  -H "Cookie: __session=<token>"
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message here"
}
```

**Common Status Codes:**
- 400: Bad Request (validation error)
- 401: Unauthorized (not authenticated)
- 409: Conflict (resource already exists)
- 500: Internal Server Error

---

## Environment Variables

```env
# Required
OPENROUTER_API_KEY=sk-or-v1-xxx

# Optional (defaults shown)
OPENROUTER_MODEL=anthropic/claude-3-haiku-20240307
```

---

## Date Handling

All `dateLocal` values are in YYYY-MM-DD format and represent the date in the user's timezone.

If `dateLocal` is not provided, it defaults to the current date in the user's configured timezone (or UTC if not set).
