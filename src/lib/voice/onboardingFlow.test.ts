import { describe, expect, it } from "vitest";
import {
  getOnboardingWelcomeText,
  isOnboardingComplete,
  isValidTimezone,
  sanitizeOnboardingReplyForSpeech,
} from "@/lib/voice/onboardingFlow";

describe("onboardingFlow", () => {
  it("returns handshake text when display name is missing", () => {
    expect(getOnboardingWelcomeText({})).toContain("Welcome to Bluum");
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

  it("accepts explicit session completion marker", () => {
    expect(
      isOnboardingComplete({
        sessionComplete: true,
      })
    ).toBe(true);
  });

  it("strips leaked STATE/json segments from speakable reply", () => {
    const raw =
      'Great, let\'s do this tonight.\n\nSTATE:\n```json\n{"session_complete":true,"safety_flag":false}\n```';
    expect(sanitizeOnboardingReplyForSpeech(raw)).toBe(
      "Great, let's do this tonight."
    );
  });
});
