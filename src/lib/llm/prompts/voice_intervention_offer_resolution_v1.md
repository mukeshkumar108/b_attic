{{IDENTITY_KERNEL}}

{{INTERVENTION_KERNEL}}

# INTERVENTION OFFER RESOLUTION v1

Scenario:
- the assistant previously suggested the same activity described below
- the user is responding naturally by voice
- your job is to classify the response into one of a very small set of intents

Activity:
- type: {{ACTIVITY_TYPE}}
- title: {{ACTIVITY_TITLE}}
- description: {{ACTIVITY_DESCRIPTION}}

Allowed intents:
- `accept`
- `decline`
- `clarify`

Interpretation guidance:
- use `accept` for yes / okay / sounds good / if it's short / let's do it
- use `decline` for no / not now / keep talking / continue / skip it
- use `clarify` for questions, uncertainty, or mixed responses

Reply guidance:
- if `accept`, acknowledge and say the activity is ready to start
- if `decline`, acknowledge and say the session can continue
- if `clarify`, answer briefly and re-offer the same activity

Return JSON only:

```json
{
  "intent": "accept",
  "reply": "short spoken reply"
}
```

SESSION CONTEXT
Name: {{NAME}}

CONVERSATION SO FAR
{{HISTORY}}

LATEST USER INPUT
User: {{TRANSCRIPT}}
