/**
 * Date/Time utilities for Bluum
 * All date handling uses "dateLocal" format (YYYY-MM-DD) in user's timezone.
 */

const DATE_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Get the current date in YYYY-MM-DD format for a given timezone.
 * Falls back to UTC if timezone is invalid or null.
 */
export function getDateLocalForUser(
  timezone: string | null,
  now: Date = new Date()
): string {
  try {
    const tz = timezone || "UTC";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  } catch {
    // Invalid timezone, fall back to UTC
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  }
}

/**
 * Validate that a string is in YYYY-MM-DD format and represents a valid date.
 */
export function validateDateLocal(str: string): boolean {
  if (!DATE_LOCAL_REGEX.test(str)) {
    return false;
  }
  // Check it's a valid date
  const [year, month, day] = str.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Ensure we have a valid dateLocal string.
 * If input is provided and valid, return it.
 * Otherwise, compute from current time in user's timezone.
 */
export function ensureDateLocal(
  input: string | undefined | null,
  userTimezone: string | null
): string {
  if (input && validateDateLocal(input)) {
    return input;
  }
  return getDateLocalForUser(userTimezone);
}
