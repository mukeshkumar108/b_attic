function uniqueModels(models: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const model of models) {
    const value = model?.trim();
    if (!value || out.includes(value)) {
      continue;
    }
    out.push(value);
  }
  return out;
}

export function getOnboardingModelChain(): string[] {
  return uniqueModels([
    process.env.OPENROUTER_ONBOARDING_MODEL,
    process.env.OPENROUTER_REFLECTION_MODEL,
    process.env.OPENROUTER_MODEL,
  ]);
}

export function getFirstReflectionDay0ModelChain(): string[] {
  return uniqueModels([
    process.env.OPENROUTER_FIRST_REFLECTION_DAY0_MODEL,
    process.env.OPENROUTER_FIRST_REFLECTION_MODEL, // legacy support
    process.env.OPENROUTER_REFLECTION_MODEL,
    process.env.OPENROUTER_MODEL,
  ]);
}

export function getFirstReflectionDay1To3ModelChain(): string[] {
  return uniqueModels([
    process.env.OPENROUTER_FIRST_REFLECTION_DAY1_3_MODEL,
    process.env.OPENROUTER_REFLECTION_MODEL,
    process.env.OPENROUTER_MODEL,
  ]);
}
