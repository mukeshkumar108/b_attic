/**
 * Unit tests for dateLocal utilities.
 */

import { describe, it, expect } from "vitest";
import {
  getDateLocalForUser,
  validateDateLocal,
  ensureDateLocal,
} from "./dateLocal";

describe("getDateLocalForUser", () => {
  it("returns date in YYYY-MM-DD format", () => {
    const now = new Date("2024-03-15T12:00:00Z");
    const result = getDateLocalForUser("UTC", now);
    expect(result).toBe("2024-03-15");
  });

  it("converts to user timezone correctly", () => {
    // Midnight UTC on March 15 is still March 14 in Los Angeles (PST = UTC-8)
    const now = new Date("2024-03-15T05:00:00Z");
    const result = getDateLocalForUser("America/Los_Angeles", now);
    expect(result).toBe("2024-03-14");
  });

  it("handles Tokyo timezone (ahead of UTC)", () => {
    // 8pm UTC on March 14 is 5am March 15 in Tokyo (JST = UTC+9)
    const now = new Date("2024-03-14T20:00:00Z");
    const result = getDateLocalForUser("Asia/Tokyo", now);
    expect(result).toBe("2024-03-15");
  });

  it("falls back to UTC for null timezone", () => {
    const now = new Date("2024-03-15T12:00:00Z");
    const result = getDateLocalForUser(null, now);
    expect(result).toBe("2024-03-15");
  });

  it("falls back to UTC for invalid timezone", () => {
    const now = new Date("2024-03-15T12:00:00Z");
    const result = getDateLocalForUser("Invalid/Timezone", now);
    expect(result).toBe("2024-03-15");
  });

  it("uses current time if not provided", () => {
    const result = getDateLocalForUser("UTC");
    // Should be a valid date format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("validateDateLocal", () => {
  it("accepts valid YYYY-MM-DD format", () => {
    expect(validateDateLocal("2024-03-15")).toBe(true);
    expect(validateDateLocal("2024-01-01")).toBe(true);
    expect(validateDateLocal("2024-12-31")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(validateDateLocal("2024/03/15")).toBe(false);
    expect(validateDateLocal("03-15-2024")).toBe(false);
    expect(validateDateLocal("2024-3-15")).toBe(false);
    expect(validateDateLocal("2024-03-5")).toBe(false);
    expect(validateDateLocal("not-a-date")).toBe(false);
    expect(validateDateLocal("")).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(validateDateLocal("2024-02-30")).toBe(false);
    expect(validateDateLocal("2024-13-01")).toBe(false);
    expect(validateDateLocal("2024-00-15")).toBe(false);
  });

  it("accepts leap year Feb 29", () => {
    expect(validateDateLocal("2024-02-29")).toBe(true);
    expect(validateDateLocal("2023-02-29")).toBe(false);
  });
});

describe("ensureDateLocal", () => {
  it("returns valid input as-is", () => {
    const result = ensureDateLocal("2024-03-15", "UTC");
    expect(result).toBe("2024-03-15");
  });

  it("computes from timezone when input is null", () => {
    const result = ensureDateLocal(null, "UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("computes from timezone when input is undefined", () => {
    const result = ensureDateLocal(undefined, "UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("computes from timezone when input is invalid", () => {
    const result = ensureDateLocal("invalid", "UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
