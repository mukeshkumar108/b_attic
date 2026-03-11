import { z } from "zod";

// Env module: centralizes boot-time validation so config errors fail fast.
// Keep all process.env access here so other modules use typed values only.
// To add a new variable, declare it in the schema below and in .env.example.

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_JWT_KEY: z.string().min(1).optional(),
    CLERK_AUTHORIZED_PARTIES: z.string().min(1).optional(),
    POSTGRES_PRISMA_URL: z.string().min(1),
    POSTGRES_URL_NON_POOLING: z.string().min(1),
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    CLERK_WEBHOOK_SECRET: z.string().min(1),
    // OpenRouter for LLM calls (optional - fallback behavior if not set)
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().optional(),
    OPENROUTER_ONBOARDING_MODEL: z.string().optional(),
    // Voice providers (optional - required only for voice session endpoints)
    LEMONFOX_API_KEY: z.string().min(1).optional(),
    LEMONFOX_API_URL: z.string().url().optional(),
    LEMONFOX_STT_MODEL: z.string().optional(),
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
    ELEVENLABS_API_URL: z.string().url().optional(),
    ELEVENLABS_MODEL_ID: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
    VOICE_SESSION_TTL_MINUTES: z.coerce.number().int().positive().optional(),
    VOICE_TTS_AUDIO_URL_TTL_SECONDS: z.coerce.number().int().positive().optional(),
    VOICE_MAX_AUDIO_BYTES: z.coerce.number().int().positive().optional(),
    VOICE_MAX_AUDIO_MS: z.coerce.number().int().positive().optional(),
    VOICE_HANDSHAKE_MIME: z.string().optional(),
    VOICE_ONBOARDING_HANDSHAKE_URL: z.string().url().optional(),
    VOICE_ONBOARDING_HANDSHAKE_MIME: z.string().optional(),
    VOICE_FIRST_REFLECTION_DAY0_HANDSHAKE_URL: z.string().url().optional(),
    VOICE_FIRST_REFLECTION_DAY0_HANDSHAKE_MIME: z.string().optional(),
    VOICE_TEST_API_KEY: z.string().min(1).optional(),
    VOICE_TEST_USER_ID: z.string().min(1).optional(),
    OPENROUTER_FIRST_REFLECTION_MODEL: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production") {
      if (!value.CLERK_JWT_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLERK_JWT_KEY"],
          message: "CLERK_JWT_KEY is required in production",
        });
      }
      if (!value.CLERK_AUTHORIZED_PARTIES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLERK_AUTHORIZED_PARTIES"],
          message: "CLERK_AUTHORIZED_PARTIES is required in production",
        });
      }
    }

    const hasVoiceTestApiKey = Boolean(value.VOICE_TEST_API_KEY);
    const hasVoiceTestUserId = Boolean(value.VOICE_TEST_USER_ID);
    if (hasVoiceTestApiKey !== hasVoiceTestUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VOICE_TEST_API_KEY"],
        message:
          "VOICE_TEST_API_KEY and VOICE_TEST_USER_ID must be set together",
      });
    }
  });

export const env = envSchema.parse(process.env);
