-- CreateEnum
CREATE TYPE "public"."CoachType" AS ENUM ('NONE', 'VALIDATE', 'NUDGE');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "reflectionReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reflectionReminderTimeLocal" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "public"."DailyStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "didSwapPrompt" BOOLEAN NOT NULL DEFAULT false,
    "hasReflection" BOOLEAN NOT NULL DEFAULT false,
    "hasMood" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),
    "followupSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromptHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "tagsUsed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyReflection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "coachType" "public"."CoachType" NOT NULL DEFAULT 'NONE',
    "coachText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReflectionAddendum" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReflectionAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MoodLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GratitudeMoment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GratitudeMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStartLocal" TEXT NOT NULL,
    "periodEndLocal" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyStatus_userId_idx" ON "public"."DailyStatus"("userId");

-- CreateIndex
CREATE INDEX "DailyStatus_dateLocal_idx" ON "public"."DailyStatus"("dateLocal");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStatus_userId_dateLocal_key" ON "public"."DailyStatus"("userId", "dateLocal");

-- CreateIndex
CREATE INDEX "PromptHistory_userId_idx" ON "public"."PromptHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptHistory_userId_dateLocal_key" ON "public"."PromptHistory"("userId", "dateLocal");

-- CreateIndex
CREATE INDEX "DailyReflection_userId_idx" ON "public"."DailyReflection"("userId");

-- CreateIndex
CREATE INDEX "DailyReflection_dateLocal_idx" ON "public"."DailyReflection"("dateLocal");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReflection_userId_dateLocal_key" ON "public"."DailyReflection"("userId", "dateLocal");

-- CreateIndex
CREATE INDEX "ReflectionAddendum_userId_idx" ON "public"."ReflectionAddendum"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReflectionAddendum_userId_dateLocal_key" ON "public"."ReflectionAddendum"("userId", "dateLocal");

-- CreateIndex
CREATE INDEX "MoodLog_userId_idx" ON "public"."MoodLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MoodLog_userId_dateLocal_key" ON "public"."MoodLog"("userId", "dateLocal");

-- CreateIndex
CREATE INDEX "GratitudeMoment_userId_idx" ON "public"."GratitudeMoment"("userId");

-- CreateIndex
CREATE INDEX "GratitudeMoment_createdAt_idx" ON "public"."GratitudeMoment"("createdAt");

-- CreateIndex
CREATE INDEX "UserSummary_userId_idx" ON "public"."UserSummary"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSummary_userId_periodType_periodStartLocal_key" ON "public"."UserSummary"("userId", "periodType", "periodStartLocal");

-- AddForeignKey
ALTER TABLE "public"."DailyStatus" ADD CONSTRAINT "DailyStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromptHistory" ADD CONSTRAINT "PromptHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyReflection" ADD CONSTRAINT "DailyReflection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReflectionAddendum" ADD CONSTRAINT "ReflectionAddendum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MoodLog" ADD CONSTRAINT "MoodLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GratitudeMoment" ADD CONSTRAINT "GratitudeMoment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSummary" ADD CONSTRAINT "UserSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
