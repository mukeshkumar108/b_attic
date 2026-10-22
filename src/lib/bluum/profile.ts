import { z } from "zod";

const MIN_AGE = 13;

/** The details a person chooses to share about themselves. Everything is optional; null clears a field. */
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  pronouns: z.string().trim().max(30).nullable().optional(),
  gender: z.string().trim().max(40).nullable().optional(),
  birthYear: z
    .number()
    .int()
    .min(1900)
    .refine((y) => y <= new Date().getFullYear() - MIN_AGE, "birth year makes you younger than 13")
    .nullable()
    .optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Empty strings clear a field rather than store "". */
export function normaliseProfileUpdate(input: ProfileUpdate): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  if (input.displayName !== undefined) out.displayName = input.displayName;
  for (const key of ["pronouns", "gender"] as const) {
    const v = input[key];
    if (v !== undefined) out[key] = v === null || v === "" ? null : v;
  }
  if (input.birthYear !== undefined) out.birthYear = input.birthYear;
  return out;
}
