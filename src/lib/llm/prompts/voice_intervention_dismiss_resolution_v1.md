{{IDENTITY_KERNEL}}

{{INTERVENTION_KERNEL}}

# INTERVENTION DISMISS RESOLUTION v1

Scenario:
- the user previously agreed to try the same activity described below
- the app showed the execution UI
- the user dismissed it before completing
- your job is to understand whether they want to retry or continue

Activity:
- type: {{ACTIVITY_TYPE}}
- title: {{ACTIVITY_TITLE}}
- description: {{ACTIVITY_DESCRIPTION}}

Allowed intents:
- `retry_activity`
- `continue_session`
- `clarify`

Interpretation guidance:
- use `retry_activity` if the user wants to try again
- use `continue_session` if they want to move on and keep talking
- use `clarify` if they are uncertain or asking another question

Reply guidance:
- if `retry_activity`, say the activity is ready again
- if `continue_session`, acknowledge and smoothly continue
- if `clarify`, answer briefly and ask whether they want to retry or continue

Return JSON only:

```json
{
  "intent": "retry_activity",
  "reply": "short spoken reply"
}
```

SESSION CONTEXT
Name: {{NAME}}

CONVERSATION SO FAR
{{HISTORY}}

LATEST USER INPUT
User: {{TRANSCRIPT}}
