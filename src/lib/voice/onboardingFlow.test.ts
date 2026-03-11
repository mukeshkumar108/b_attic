import { describe, expect, it } from "vitest";
import {
  getOnboardingWelcomeText,
  isOnboardingComplete,
  isValidTimezone,
} from "@/lib/voice/onboardingFlow";

describe("onboardingFlow", () => {
  it("returns welcome question when display name is missing", () => {
    expect(getOnboardingWelcomeText({})).toContain("name");
  });

  it("validates complete onboarding drafts", () => {
    expect(
      isOnboardingComplete({
        displayName: "Alex",
        timezone: "America/New_York",
        reflectionReminderEnabled: true,
        reflectionReminderTimeLocal: "20:00",
      })
    ).toBe(true);
  });

  it("requires reminder time when reminders are enabled", () => {
    expect(
      isOnboardingComplete({
        displayName: "Alex",
        timezone: "America/New_York",
        reflectionReminderEnabled: true,
        reflectionReminderTimeLocal: null,
      })
    ).toBe(false);
  });

  it("validates timezone format and value", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("not_a_timezone")).toBe(false);
  });
});
