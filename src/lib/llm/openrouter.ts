/**
 * OpenRouter API integration.
 * Handles LLM calls with strict JSON output.
 */

import { z } from "zod";
import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3-haiku-20240307";

/**
 * Load a markdown prompt template.
 */
export function loadPromptMd(templatePath: string): string {
  const fullPath = path.join(process.cwd(), templatePath);
  return fs.readFileSync(fullPath, "utf-8");
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
