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
  });

export const env = envSchema.parse(process.env);
