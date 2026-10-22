-- CreateTable
CREATE TABLE "public"."VoiceSessionReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "flow" TEXT,
    "durationSeconds" INTEGER,
    "card" JSONB,
    "profile" JSONB,
    "voiceFeatures" JSONB,
    "memoryUpdates" JSONB,
    "costUsd" DOUBLE PRECISION,
    "models" JSONB,
    "promptVersion" TEXT,
    "ruleVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceSessionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "people" JSONB NOT NULL DEFAULT '[]',
    "themes" JSONB NOT NULL DEFAULT '[]',
    "facts" JSONB NOT NULL DEFAULT '[]',
    "openThreads" JSONB NOT NULL DEFAULT '[]',
    "style" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceSessionReport_conversationId_key" ON "public"."VoiceSessionReport"("conversationId");

-- CreateIndex
CREATE INDEX "VoiceSessionReport_userId_createdAt_idx" ON "public"."VoiceSessionReport"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_key" ON "public"."UserMemory"("userId");

-- AddForeignKey
ALTER TABLE "public"."VoiceSessionReport" ADD CONSTRAINT "VoiceSessionReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

