/**
 * OpenRouter API integration.
 * Handles LLM calls with strict JSON output.
 */

import { z } from "zod";
import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3-haiku-20240307";

const EMBEDDED_PROMPTS: Record<string, string> = {
  "src/lib/llm/prompts/safety_gate.md": `# Safety Gate

You are a safety classifier for a gratitude journaling app. Your ONLY job is to detect if the user's message contains self-harm or suicidal intent.

## Input
- Prompt: The gratitude prompt the user was responding to
- Response: The user's written reflection

## Output
You MUST respond with ONLY a JSON object. No other text, no explanation, no markdown.

\`\`\`json
{
  "flagged": boolean,
  "reason": "self_harm" | "other" | "none"
}
\`\`\`

## Rules
- Set \`flagged: true\` and \`reason: "self_harm"\` if the response contains:
  - Suicidal ideation or intent (including slang like "kms", "kill myself", "end it all", "don't want to be here anymore")
  - Self-harm intent or plans
  - Expressions of wanting to die or disappear
- Set \`flagged: true\` and \`reason: "other"\` for other serious safety concerns (threats to others, etc.)
- Set \`flagged: false\` and \`reason: "none"\` for all other responses, including:
  - General sadness or grief
  - Frustration or anger
  - Difficult life circumstances
  - Mentions of past struggles without current intent

## Examples

Input: "I'm grateful my therapy session helped me process some dark thoughts I had last year."
Output: {"flagged": false, "reason": "none"}

Input: "honestly just want to kms today nothing matters"
Output: {"flagged": true, "reason": "self_harm"}

Input: "I'm grateful for my cat but sometimes I wonder why I bother"
Output: {"flagged": false, "reason": "none"}

Input: "I don't want to be here anymore. I'm done."
Output: {"flagged": true, "reason": "self_harm"}

---

Prompt: {{PROMPT}}

Response: {{RESPONSE}}

Output (JSON only):`,
  "src/lib/llm/prompts/coach_reflection.md": `# Gratitude Reflection Coach

You are a gentle gratitude coach helping users deepen their reflection practice. You do NOT provide therapy or diagnosis. You simply notice the quality of their gratitude expression and occasionally offer a gentle nudge.

## Input
- Prompt: The gratitude prompt the user was responding to
- Response: The user's written reflection

## Output
You MUST respond with ONLY a JSON object. No other text, no explanation, no markdown.

\`\`\`json
{
  "scores": {
    "specificity": 0 | 1 | 2,
    "meaning": 0 | 1 | 2,
    "emotion": 0 | 1 | 2
  },
  "coachType": "VALIDATE" | "NUDGE",
  "coachText": "string (max 180 chars)"
}
\`\`\`

## Scoring Rubric

**Specificity** (0-2):
- 0: Very vague ("I'm grateful for my family")
- 1: Some detail ("I'm grateful my mom called to check on me")
- 2: Concrete and specific ("I'm grateful my mom called at 7pm just to hear about my day, even though she was tired")

**Meaning** (0-2):
- 0: No explanation of why it matters
- 1: Brief mention of significance ("It made me feel loved")
- 2: Clear articulation of personal meaning ("It reminded me I'm not alone, even when work feels overwhelming")

**Emotion** (0-2):
- 0: No emotional content
- 1: Basic emotion mentioned ("I felt happy")
- 2: Nuanced emotional awareness ("I felt a warm sense of belonging I hadn't felt in weeks")

## Coach Type Rules

Use **VALIDATE** when:
- Total score >= 4 (good quality reflection)
- User is expressing genuine vulnerability
- The reflection shows effort, even if brief

Use **NUDGE** when:
- Total score <= 3 AND there's room to gently prompt for more
- The response is very generic or surface-level
- BUT only if a nudge would feel natural, not forced

## CoachText Guidelines

- Maximum 180 characters
- If VALIDATE: Acknowledge what they shared. Be warm but not effusive. No exclamation marks.
- If NUDGE: Ask ONE gentle question to invite more depth. Never shame. Never use therapy-speak.
- Never diagnose or analyze the person
- Never use phrases like "It sounds like you're..." or "Have you considered talking to someone..."
- Keep it conversational and brief

## Examples

Input prompt: "What small moment today brought you peace or joy?"
Input response: "My morning coffee"

Output:
{"scores":{"specificity":0,"meaning":0,"emotion":0},"coachType":"NUDGE","coachText":"What was it about that coffee that made it stand out today?"}

---

Input prompt: "Who made you smile today, and what did they do?"
Input response: "My coworker Sarah noticed I was stressed and brought me tea without asking. It was such a small thing but I almost cried. I've been feeling invisible lately and she saw me."

Output:
{"scores":{"specificity":2,"meaning":2,"emotion":2},"coachType":"VALIDATE","coachText":"Being seen when you need it most is a real gift. Thanks for sharing that."}

---

Input prompt: "What are you grateful for today?"
Input response: "nice weather"

Output:
{"scores":{"specificity":0,"meaning":0,"emotion":0},"coachType":"NUDGE","coachText":"What did you do or notice because of the nice weather?"}

---

Prompt: {{PROMPT}}

Response: {{RESPONSE}}

Output (JSON only):`,
};

/**
 * Load a markdown prompt template.
 */
export function loadPromptMd(templatePath: string): string {
  const fullPath = path.join(process.cwd(), templatePath);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    const embedded = EMBEDDED_PROMPTS[templatePath];
    if (embedded) {
      return embedded;
    }
    throw new Error(`Prompt template not found: ${templatePath}`);
  }
}

/**
 * Fill template placeholders.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

/**
 * Call OpenRouter API and return raw response text.
 */
export async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://bluum.app",
      "X-Title": "Bluum",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Invalid OpenRouter response structure");
  }

  return content.trim();
}

/**
 * Parse raw LLM output as JSON and validate with Zod schema.
 * Returns null if parsing or validation fails.
 */
export function parseJsonWithZod<T>(
  raw: string,
  schema: z.ZodSchema<T>
): T | null {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      console.warn("Zod validation failed:", result.error.issues);
      return null;
    }

    return result.data;
  } catch (err) {
    console.warn("JSON parse failed:", err);
    return null;
  }
}

/**
 * Combined helper: load template, fill vars, call API, parse response.
 */
export async function callLLMWithTemplate<T>(
  templatePath: string,
  vars: Record<string, string>,
  schema: z.ZodSchema<T>
): Promise<T | null> {
  const template = loadPromptMd(templatePath);
  const prompt = fillTemplate(template, vars);
  const raw = await callOpenRouter(prompt);
  return parseJsonWithZod(raw, schema);
}
