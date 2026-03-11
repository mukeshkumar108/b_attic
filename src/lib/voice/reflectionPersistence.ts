import { prisma } from "@/lib/prisma";
import { getOrCreateDailyStatus } from "@/lib/bluum/dailyStatus";
import {
  getSafetyResponse,
  runRubricCoach,
  runSafetyGate,
} from "@/lib/bluum/coaching";
import { getSuccessMessage } from "@/lib/bluum/messages/successMessages";
import { VoiceServiceError } from "@/lib/voice/errors";

export interface VoiceReflectionResult {
  saved: boolean;
  safetyFlagged: boolean;
  safeResponse?: {
    message: string;
    resources: { label: string; value: string }[];
  };
  coach: { type: "validate" | "nudge"; text: string } | null;
  successMessage: string | null;
}

export async function finalizeVoiceReflection(params: {
  userId: string;
  dateLocal: string;
  responseText: string;
}): Promise<VoiceReflectionResult> {
  const existingReflection = await prisma.dailyReflection.findUnique({
    where: { userId_dateLocal: { userId: params.userId, dateLocal: params.dateLocal } },
  });

  if (existingReflection) {
    throw new VoiceServiceError(
      "reflection_exists",
      409,
      false,
      "Reflection already exists for this date."
    );
  }

  const { status } = await getOrCreateDailyStatus(params.userId, params.dateLocal);

  const totalReflections = await prisma.dailyReflection.count({
    where: { userId: params.userId },
  });

  const streakData = await computeCurrentStreak(params.userId, params.dateLocal);

  const safetyResult = await runSafetyGate({
    promptText: status.promptText,
    responseText: params.responseText,
  });

  if (safetyResult.flagged) {
    await prisma.$transaction([
      prisma.dailyReflection.create({
        data: {
          userId: params.userId,
          dateLocal: params.dateLocal,
          promptId: status.promptId,
          promptText: status.promptText,
          responseText: params.responseText,
          coachType: "NONE",
          coachText: null,
        },
      }),
      prisma.dailyStatus.update({
        where: { userId_dateLocal: { userId: params.userId, dateLocal: params.dateLocal } },
        data: { hasReflection: true },
      }),
    ]);

    return {
      saved: true,
      safetyFlagged: true,
      safeResponse: getSafetyResponse(),
      coach: null,
      successMessage: null,
    };
  }

  const coachResult = await runRubricCoach({
    promptText: status.promptText,
    responseText: params.responseText,
  });

  await prisma.$transaction([
    prisma.dailyReflection.create({
      data: {
        userId: params.userId,
        dateLocal: params.dateLocal,
        promptId: status.promptId,
        promptText: status.promptText,
        responseText: params.responseText,
        coachType: coachResult.coachType,
        coachText: coachResult.coachText,
      },
    }),
    prisma.dailyStatus.update({
      where: { userId_dateLocal: { userId: params.userId, dateLocal: params.dateLocal } },
      data: { hasReflection: true },
    }),
  ]);

  const successMessage = getSuccessMessage({
    currentStreak: streakData.currentStreak,
    totalReflections,
    userId: params.userId,
    dateLocal: params.dateLocal,
  });

  return {
    saved: true,
    safetyFlagged: false,
    coach: {
      type: coachResult.coachType.toLowerCase() as "validate" | "nudge",
      text: coachResult.coachText,
    },
    successMessage,
  };
}

async function computeCurrentStreak(
  userId: string,
  dateLocal: string
): Promise<{ currentStreak: number }> {
  const statuses = await prisma.dailyStatus.findMany({
    where: {
      userId,
      hasReflection: true,
      dateLocal: { lte: dateLocal },
    },
    orderBy: { dateLocal: "desc" },
    take: 400,
    select: { dateLocal: true },
  });

  if (statuses.length === 0) {
    return { currentStreak: 0 };
  }

  let streak = 0;
  const currentDate = new Date(dateLocal + "T00:00:00Z");

  for (const status of statuses) {
    const expectedDate = formatDateUTC(currentDate);
    if (status.dateLocal === expectedDate) {
      streak++;
      currentDate.setUTCDate(currentDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return { currentStreak: streak };
}

function formatDateUTC(date: Date): string {
  return date.toISOString().split("T")[0];
}
