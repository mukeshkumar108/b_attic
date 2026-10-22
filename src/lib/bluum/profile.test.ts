import { describe, expect, it } from "vitest";
import { normaliseProfileUpdate, profileUpdateSchema } from "./profile";

describe("profile update", () => {
  it("accepts a partial update and trims the name", () => {
    const parsed = profileUpdateSchema.parse({ displayName: "  Sam  ", birthYear: 1990 });
    expect(normaliseProfileUpdate(parsed)).toEqual({ displayName: "Sam", birthYear: 1990 });
  });

  it("an empty string or null clears pronouns and gender; absent fields are left alone", () => {
    const parsed = profileUpdateSchema.parse({ pronouns: "", gender: null });
    expect(normaliseProfileUpdate(parsed)).toEqual({ pronouns: null, gender: null });
  });

  it("rejects an empty name, an impossible birth year, and anyone under 13", () => {
    expect(profileUpdateSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ birthYear: 1850 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ birthYear: new Date().getFullYear() - 5 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ birthYear: new Date().getFullYear() - 30 }).success).toBe(true);
  });
});
