# Voice Intervention State Machine

Status: Draft implementation guide for `voice_demo`, later reusable for reflection/onboarding sidecar activities
Last updated: 2026-03-28

## Why this exists

Voice sessions should let users respond naturally:
- "yeah okay"
- "not now"
- "why this?"
- "I don't want to lose my train of thought"

But the product still needs predictable behavior when an activity is offered.

The design goal is:
- natural spoken input from the user
- narrow LLM interpretation of that input
- deterministic backend-controlled state transitions
- UI that only appears when the interaction has become explicit enough to need it

This document defines the state machine for that intervention flow.

## Core principle

Do not let the main session prompt absorb all activity-offer logic.

Instead, treat an offered activity as a temporary sub-state of the voice session:
- the main session continues as normal until an intervention is offered
- once offered, the system enters an intervention-resolution state
- the LLM only interprets user intent inside that narrow state
- the backend owns valid transitions
- the UI only appears at the execution stage, not at the conversational negotiation stage

## High-level modes

At the top level, a voice session has two modes:

1. `main_conversation`
2. `intervention`

`intervention` is a temporary sub-flow. Once resolved, control returns to `main_conversation`.

## Intervention states

Recommended states:

- `offered`
- `clarifying`
- `accepted_pending_start`
- `active`
- `dismissed_after_accept`
- `declined`
- `completed`
- `exited`
- `resolved`

Minimal v1 can collapse some of these, but they are useful as the full conceptual model.

### `offered`

Meaning:
- the assistant has suggested an activity in voice
- the user has not yet accepted, declined, or asked for clarification

User input:
- voice stays enabled

UI:
- no modal yet
- optional small non-interactive visual hint is acceptable
- avoid showing a commit-style accept/dismiss card at this stage

### `clarifying`

Meaning:
- user responded with a question or uncertainty rather than a direct accept/decline

Examples:
- "why?"
- "how long is it?"
- "what is that?"
- "I don't want to lose my place"

User input:
- voice stays enabled

UI:
- still no modal

LLM role:
- answer briefly
- restate the offer naturally
- do not resume the main session yet

### `accepted_pending_start`

Meaning:
- the user has accepted the activity verbally
- the app now needs explicit UI to begin the activity

User input:
- mic should be disabled or hidden

UI:
- show execution UI only now
- this can be a modal, overlay, or start card
- controls should be concrete: `Start` and `Dismiss`

This is the point where the flow becomes structured.

### `active`

Meaning:
- the activity is in progress

User input:
- voice session is paused

UI:
- full-screen guided flow or focused activity screen

### `dismissed_after_accept`

Meaning:
- user verbally accepted
- execution UI appeared
- user dismissed before finishing

User input:
- voice is re-enabled

UI:
- execution UI is gone

LLM role:
- gently ask what the user wants next
- likely choices:
  - continue session
  - retry activity
  - ask another question

### `declined`

Meaning:
- user declined before activity started

Behavior:
- assistant acknowledges briefly
- intervention resolves
- return to main session

### `completed`

Meaning:
- activity finished successfully

Behavior:
- assistant integrates the result naturally
- return to main session

### `exited`

Meaning:
- activity started but did not complete

Behavior:
- assistant acknowledges without pressure
- either continue the session or offer one retry path

### `resolved`

Meaning:
- intervention sub-flow is finished
- control returns to main conversation

At this point the intervention state should be cleared from session state.

## Transition map

Canonical transitions:

1. `main_conversation -> intervention.offered`
2. `offered -> clarifying`
3. `clarifying -> clarifying`
4. `offered -> accepted_pending_start`
5. `clarifying -> accepted_pending_start`
6. `offered -> declined`
7. `clarifying -> declined`
8. `accepted_pending_start -> active`
9. `accepted_pending_start -> dismissed_after_accept`
10. `active -> completed`
11. `active -> exited`
12. `dismissed_after_accept -> resolved`
13. `declined -> resolved`
14. `completed -> resolved`
15. `exited -> resolved`
16. `resolved -> main_conversation`

## Ownership model

### Backend owns

- current intervention state
- allowed transitions
- whether the activity offer is still pending
- whether mic should be enabled
- whether the execution UI should appear
- whether a retry is still allowed
- what prompt family to use next

### LLM owns

- natural-language interpretation of the user's utterance
- narrow classification of intent within the active intervention state
- concise response wording

### Frontend owns

- rendering current state
- mic enabled/disabled behavior
- opening execution UI only when backend state says to
- returning concrete execution results back to backend

## LLM usage model

The LLM should not decide arbitrary next states.

Instead, it should be used as a bounded interpreter inside the current intervention state.

Examples:

- In `offered` / `clarifying`, classify the user response as:
  - `accept`
  - `decline`
  - `clarify`

- In `dismissed_after_accept`, classify the response as:
  - `continue_session`
  - `retry_activity`
  - `clarify`

- In `completed` / `exited`, generate a short reintegration reply back into the main session

## Suggested prompt families

### 1. Offer Resolution Prompt

Used in:
- `offered`
- `clarifying`

Goal:
- interpret user speech into one of:
  - `accept`
  - `decline`
  - `clarify`

Suggested structured output:

```json
{
  "intent": "accept",
  "reply": "short spoken reply",
  "still_offering_same_activity": true
}
```

### 2. Post-Dismiss Recovery Prompt

Used in:
- `dismissed_after_accept`

Goal:
- understand whether the user wants to continue the session, retry, or ask another question

Suggested structured output:

```json
{
  "intent": "continue_session",
  "reply": "short spoken reply"
}
```

### 3. Post-Result Integration Prompt

Used in:
- `completed`
- `exited`

Goal:
- acknowledge activity outcome
- reconnect to the main session naturally

Suggested structured output:

```json
{
  "reply": "short spoken reply",
  "return_to_main_session": true
}
```

## UI rules

### Offer stage

- voice remains active
- do not show accept/dismiss controls yet
- let the user answer naturally

### Confirmed start stage

- show modal or focused execution UI
- disable or hide the mic
- execution UI now owns the interaction

### Activity running

- voice session is paused

### Activity dismissed or completed

- remove execution UI
- restore voice
- backend decides whether to retry, continue, or resolve

## Why this complexity is worth it

This is more complex than a simple card-first flow, but the complexity is contained and buys real product benefits:

- users can respond naturally instead of speaking in button labels
- the app avoids competing voice and card controls at the same moment
- the intervention becomes much harder to derail
- the backend can test and instrument each transition
- the LLM is used where it adds value: intent interpretation, not full orchestration

This is not "LLM everywhere" complexity.
It is structured complexity in service of a tighter voice UX.

## Why not let the LLM handle everything

An unconstrained conversational model can often infer intent correctly, but it should not be trusted to own the product state machine.

If the LLM is allowed to manage both:
- language interpretation
- and state transitions

then failures become harder to reproduce, test, and reason about.

The safer model is:
- user speaks naturally
- LLM maps speech to a narrow intent
- backend enforces valid next states

That preserves both natural interaction and product control.

## Recommended v1 scope

For `voice_demo`:

- one activity type only: breathing
- one slug only: `breathing-4-7-8`
- one retry max
- no nested intervention loops
- one narrow prompt family for offer resolution
- one narrow prompt family for post-dismiss recovery
- one narrow prompt family for post-result integration

This is enough to validate the full pattern without overbuilding.

## Future extension

If this works well in `voice_demo`, the same state machine can later be reused for:

- reflection sidecar breathing resets
- post-reflection lesson suggestions
- onboarding guided resets

The key is that the intervention system should remain a reusable sub-flow, not a set of hardcoded special cases embedded directly into each main voice flow.
