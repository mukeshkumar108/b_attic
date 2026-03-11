-- CreateEnum
CREATE TYPE "public"."VoiceFlow" AS ENUM ('ONBOARDING', 'FIRST_REFLECTION');

-- CreateEnum
CREATE TYPE "public"."VoiceSessionState" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED', 'ABORTED');

-- CreateTable
CREATE TABLE "public"."VoiceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flow" "public"."VoiceFlow" NOT NULL,
    "state" "public"."VoiceSessionState" NOT NULL DEFAULT 'ACTIVE',
    "dateLocal" TEXT,
    "promptId" TEXT,
    "promptText" TEXT,
    "locale" TEXT,
    "ttsVoiceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "safetyFlagged" BOOLEAN NOT NULL DEFAULT false,
    "safetyReason" TEXT,
    "safeResponse" JSONB,
    "draft" JSONB,
    "result" JSONB,
    "clientSessionId" TEXT NOT NULL,
    "startRequestHash" TEXT NOT NULL,
    "startResponseJson" JSONB,
    "endClientId" TEXT,
    "endRequestHash" TEXT,
    "endResponseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VoiceTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "clientTurnId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB,
    "userTranscriptText" TEXT NOT NULL,
    "assistantText" TEXT NOT NULL,
    "assistantAudioUrl" TEXT,
    "assistantAudioMimeType" TEXT,
    "assistantAudioExpiresAt" TIMESTAMP(3),
    "ttsAvailable" BOOLEAN NOT NULL DEFAULT false,
    "safetyFlagged" BOOLEAN NOT NULL DEFAULT false,
    "safetyReason" TEXT,
    "safeResponse" JSONB,
    "sttLatencyMs" INTEGER,
    "llmLatencyMs" INTEGER,
    "ttsLatencyMs" INTEGER,
    "totalLatencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceSession_userId_idx" ON "public"."VoiceSession"("userId");

-- CreateIndex
CREATE INDEX "VoiceSession_userId_state_idx" ON "public"."VoiceSession"("userId", "state");

-- CreateIndex
CREATE INDEX "VoiceSession_expiresAt_idx" ON "public"."VoiceSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceSession_userId_clientSessionId_key" ON "public"."VoiceSession"("userId", "clientSessionId");

-- CreateIndex
CREATE INDEX "VoiceTurn_sessionId_idx" ON "public"."VoiceTurn"("sessionId");

-- CreateIndex
CREATE INDEX "VoiceTurn_userId_idx" ON "public"."VoiceTurn"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTurn_sessionId_turnIndex_key" ON "public"."VoiceTurn"("sessionId", "turnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTurn_sessionId_clientTurnId_key" ON "public"."VoiceTurn"("sessionId", "clientTurnId");

-- AddForeignKey
ALTER TABLE "public"."VoiceSession" ADD CONSTRAINT "VoiceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VoiceTurn" ADD CONSTRAINT "VoiceTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."VoiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VoiceTurn" ADD CONSTRAINT "VoiceTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
