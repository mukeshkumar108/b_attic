import { Prisma } from "@prisma/client";
import type { User, VoiceFlow, VoiceSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";
import { getOrCreateDailyStatus } from "@/lib/bluum/dailyStatus";
import { getSafetyResponse, runSafetyGate, runRubricCoach } from "@/lib/bluum/coaching";
import { finalizeVoiceReflection } from "@/lib/voice/reflectionPersistence";
import {
  DEFAULT_VOICE_LOCALE,
  VOICE_MAX_AUDIO_BYTES,
  VOICE_MAX_AUDIO_MS,
  VOICE_SESSION_TTL_MINUTES,
  ACCEPTED_AUDIO_MIME_TYPES,
} from "@/lib/voice/constants";
import { VoiceServiceError } from "@/lib/voice/errors";
import { hashBuffer, hashObject } from "@/lib/voice/hash";
import {
  getOnboardingWelcomeText,
  isOnboardingComplete,
  isValidTimezone,
  runOnboardingTurn,
  type OnboardingDraft,
} from "@/lib/voice/onboardingFlow";
import {
  getDefaultVoicePromptBinding,
  resolveOnboardingPromptBinding,
  type VoicePromptBinding,
} from "@/lib/voice/promptRegistry";
import { synthesizeWithElevenlabs } from "@/lib/voice/providers/elevenlabs";
import { transcribeWithLemonfox } from "@/lib/voice/providers/lemonfox";
import { loadPromptMdStrict } from "@/lib/llm/openrouter";

export type VoiceFlowInput = "onboarding" | "first_reflection";

interface AssistantPayload {
  text: string;
  audioUrl: string | null;
  audioMimeType: string | null;
  audioExpiresAt: string | null;
  ttsAvailable: boolean;
}

interface SafetyPayload {
  flagged: boolean;
  reason: string;
  safeResponse: ReturnType<typeof getSafetyResponse> | null;
}

interface AudioPayloadLike {
  audioUrl: string | null;
  audioMimeType: string | null;
  audioExpiresAt: string | null;
  ttsAvailable: boolean;
}

function toDbFlow(flow: VoiceFlowInput): VoiceFlow {
  return flow === "onboarding" ? "ONBOARDING" : "FIRST_REFLECTION";
}

function toApiFlow(flow: VoiceFlow): VoiceFlowInput {
  return flow === "ONBOARDING" ? "onboarding" : "first_reflection";
}

function getNextExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + VOICE_SESSION_TTL_MINUTES * 60 * 1000);
}

function parseOnboardingDraft(value: unknown): OnboardingDraft {
  if (!value || typeof value !== "object") {
    return {};
  }

  const draft = value as Record<string, unknown>;
  return {
    displayName:
      typeof draft.displayName === "string" ? draft.displayName : null,
    timezone: typeof draft.timezone === "string" ? draft.timezone : null,
    reflectionReminderEnabled:
      typeof draft.reflectionReminderEnabled === "boolean"
        ? draft.reflectionReminderEnabled
        : null,
    reflectionReminderTimeLocal:
      typeof draft.reflectionReminderTimeLocal === "string"
        ? draft.reflectionReminderTimeLocal
        : null,
    sessionComplete:
      typeof draft.sessionComplete === "boolean"
        ? draft.sessionComplete
        : null,
  };
}

function getBaseOnboardingDraft(user: User): OnboardingDraft {
  return {
    displayName: user.displayName ?? null,
    timezone: user.timezone ?? null,
    reflectionReminderEnabled: user.reflectionReminderEnabled,
    reflectionReminderTimeLocal: user.reflectionReminderTimeLocal ?? null,
    sessionComplete: false,
  };
}

function makeAssistantPayload(
  text: string,
  tts: {
    audioUrl: string | null;
    audioMimeType: string | null;
    audioExpiresAt: string | null;
    ttsAvailable: boolean;
  }
): AssistantPayload {
  return {
    text,
    audioUrl: tts.audioUrl,
    audioMimeType: tts.audioMimeType,
    audioExpiresAt: tts.audioExpiresAt,
    ttsAvailable: tts.ttsAvailable,
  };
}

function getOnboardingStartAudioFromEnv(): AudioPayloadLike | null {
  const audioUrl = process.env.VOICE_ONBOARDING_HANDSHAKE_URL?.trim();
  if (!audioUrl) {
    return null;
  }

  return {
    audioUrl,
    audioMimeType:
      process.env.VOICE_ONBOARDING_HANDSHAKE_MIME?.trim() || "audio/mpeg",
    audioExpiresAt: null,
    ttsAvailable: true,
  };
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function loadSessionOrThrow(sessionId: string, userId: string): Promise<VoiceSession> {
  const session = await prisma.voiceSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    throw new VoiceServiceError("session_not_found", 404, false, "Session not found.");
  }

  return session;
}

async function ensureSessionActive(session: VoiceSession): Promise<VoiceSession> {
  if (session.state !== "ACTIVE") {
    throw new VoiceServiceError(
      "session_inactive",
      409,
      false,
      "Session is not active."
    );
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.voiceSession.update({
      where: { id: session.id },
      data: {
        state: "EXPIRED",
        endedAt: new Date(),
      },
    });
    throw new VoiceServiceError(
      "session_expired",
      409,
      false,
      "Session has expired."
    );
  }

  return session;
}

export async function startVoiceSession(params: {
  user: User;
  flow: VoiceFlowInput;
  clientSessionId: string;
  dateLocal?: string | null;
  locale?: string | null;
  ttsVoiceId?: string | null;
}): Promise<{ status: number; body: unknown }> {
  const normalized = {
    flow: params.flow,
    dateLocal: params.dateLocal ?? null,
    locale: params.locale ?? null,
    ttsVoiceId: params.ttsVoiceId ?? null,
  };
  const requestHash = hashObject(normalized);

  const existing = await prisma.voiceSession.findUnique({
    where: {
      userId_clientSessionId: {
        userId: params.user.id,
        clientSessionId: params.clientSessionId,
      },
    },
  });

  if (existing) {
    if (existing.startRequestHash !== requestHash) {
      throw new VoiceServiceError(
        "idempotency_conflict",
        409,
        false,
        "This clientSessionId was already used with a different request."
      );
    }
    if (existing.startResponseJson) {
      return { status: 200, body: existing.startResponseJson };
    }
    throw new VoiceServiceError(
      "internal_error",
      500,
      true,
      "Unable to replay start response."
    );
  }

  const dbFlow = toDbFlow(params.flow);
  const locale = params.locale ?? DEFAULT_VOICE_LOCALE;
  const expiresAt = getNextExpiry();
  let promptId: string | null = null;
  let promptText: string | null = null;
  let dateLocal: string | null = null;
  let draft: OnboardingDraft | null = null;

  if (dbFlow === "FIRST_REFLECTION") {
    if (params.dateLocal && !validateDateLocal(params.dateLocal)) {
      throw new VoiceServiceError(
        "validation_error",
        400,
        false,
        "Invalid dateLocal format (expected YYYY-MM-DD)."
      );
    }
    dateLocal = ensureDateLocal(params.dateLocal, params.user.timezone);
    const existingReflection = await prisma.dailyReflection.findUnique({
      where: { userId_dateLocal: { userId: params.user.id, dateLocal } },
    });
    if (existingReflection) {
      throw new VoiceServiceError(
        "reflection_exists",
        409,
        false,
        "Reflection already exists for this date."
      );
    }
    const { status } = await getOrCreateDailyStatus(params.user.id, dateLocal);
    promptId = status.promptId;
    promptText = status.promptText;
  } else {
    draft = getBaseOnboardingDraft(params.user);
    const onboardingPromptBinding = getDefaultVoicePromptBinding(dbFlow);
    if (!onboardingPromptBinding) {
      throw new VoiceServiceError(
        "internal_error",
        500,
        true,
        "Onboarding prompt is not configured."
      );
    }

    // Validate prompt template at session start so turn processing never runs prompt-less.
    loadPromptMdStrict(onboardingPromptBinding.templatePath);
    promptId = onboardingPromptBinding.key;
    promptText = onboardingPromptBinding.version;
  }

  const session = await prisma.voiceSession.create({
    data: {
      userId: params.user.id,
      flow: dbFlow,
      state: "ACTIVE",
      dateLocal,
      promptId,
      promptText,
      locale,
      ttsVoiceId: params.ttsVoiceId ?? null,
      expiresAt,
      clientSessionId: params.clientSessionId,
      startRequestHash: requestHash,
      draft: draft ? toJsonInput(draft) : undefined,
    },
  });

  const assistantText =
    dbFlow === "FIRST_REFLECTION"
      ? `Today's prompt: ${promptText}. Share your reflection when you're ready.`
      : getOnboardingWelcomeText(draft ?? {});

  let tts: AudioPayloadLike;
  if (dbFlow === "ONBOARDING") {
    tts =
      getOnboardingStartAudioFromEnv() ??
      (await synthesizeWithElevenlabs({
        text: assistantText,
        voiceId: params.ttsVoiceId ?? null,
        blobPath: `voice/${params.user.id}/${session.id}/start.mp3`,
      }));
  } else {
    tts = await synthesizeWithElevenlabs({
      text: assistantText,
      voiceId: params.ttsVoiceId ?? null,
      blobPath: `voice/${params.user.id}/${session.id}/start.mp3`,
    });
  }

  const body = {
    session: {
      id: session.id,
      flow: toApiFlow(session.flow),
      state: "active",
      dateLocal,
      expiresAt: session.expiresAt.toISOString(),
      nextTurnIndex: 1,
      readyToEnd: false,
    },
    assistant: makeAssistantPayload(assistantText, tts),
  };

  await prisma.voiceSession.update({
    where: { id: session.id },
    data: {
      startResponseJson: toJsonInput(body),
    },
  });

  return { status: 201, body };
}

export async function processVoiceTurn(params: {
  user: User;
  sessionId: string;
  clientTurnId: string;
  audio: Buffer;
  mimeType: string;
  audioDurationMs?: number | null;
  locale?: string | null;
}): Promise<{ status: number; body: unknown }> {
  if (!ACCEPTED_AUDIO_MIME_TYPES.has(params.mimeType)) {
    throw new VoiceServiceError(
      "unsupported_media_type",
      415,
      false,
      "Unsupported audio format."
    );
  }
  if (params.audio.byteLength > VOICE_MAX_AUDIO_BYTES) {
    throw new VoiceServiceError(
      "audio_too_large",
      413,
      false,
      "Audio file is too large."
    );
  }
  if (params.audioDurationMs && params.audioDurationMs > VOICE_MAX_AUDIO_MS) {
    throw new VoiceServiceError(
      "audio_too_long",
      400,
      false,
      "Audio duration exceeds limit."
    );
  }

  const session = await ensureSessionActive(
    await loadSessionOrThrow(params.sessionId, params.user.id)
  );

  const requestHash = hashObject({
    sessionId: params.sessionId,
    clientTurnId: params.clientTurnId,
    locale: params.locale ?? null,
    audioDurationMs: params.audioDurationMs ?? null,
    audioHash: hashBuffer(params.audio),
  });

  const existingTurn = await prisma.voiceTurn.findUnique({
    where: {
      sessionId_clientTurnId: {
        sessionId: session.id,
        clientTurnId: params.clientTurnId,
      },
    },
  });

  if (existingTurn) {
    if (existingTurn.requestHash !== requestHash) {
      throw new VoiceServiceError(
        "idempotency_conflict",
        409,
        false,
        "This clientTurnId was already used with different data."
      );
    }
    if (existingTurn.responseJson) {
      return { status: 200, body: existingTurn.responseJson };
    }
    throw new VoiceServiceError("internal_error", 500, true, "Unable to replay turn response.");
  }

  const transcribed = await transcribeWithLemonfox({
    audio: params.audio,
    mimeType: params.mimeType,
    locale: params.locale ?? session.locale ?? DEFAULT_VOICE_LOCALE,
  });

  const currentTurnCount = await prisma.voiceTurn.count({
    where: { sessionId: session.id },
  });
  const turnIndex = currentTurnCount + 1;
  const promptText =
    session.flow === "FIRST_REFLECTION"
      ? session.promptText ?? "Voice reflection"
      : "Voice onboarding conversation";

  const safetyGate = await runSafetyGate({
    promptText,
    responseText: transcribed.text,
  });

  let assistantText: string;
  let readyToEnd: boolean;
  let draftToSave: unknown = session.draft;
  let safetyPayload: SafetyPayload;
  let llmLatencyMs = 0;

  if (safetyGate.flagged) {
    const safeResponse = getSafetyResponse();
    assistantText = safeResponse.message;
    readyToEnd = true;
    safetyPayload = {
      flagged: true,
      reason: safetyGate.reason,
      safeResponse,
    };
  } else if (session.flow === "ONBOARDING") {
    let onboardingPromptBinding: VoicePromptBinding;
    try {
      onboardingPromptBinding = resolveOnboardingPromptBinding({
        promptKey: session.promptId,
        promptVersion: session.promptText,
      });
    } catch {
      throw new VoiceServiceError(
        "internal_error",
        500,
        true,
        "Onboarding prompt binding is invalid."
      );
    }

    const historyTurns = await prisma.voiceTurn.findMany({
      where: { sessionId: session.id },
      orderBy: { turnIndex: "desc" },
      take: 6,
      select: {
        userTranscriptText: true,
        assistantText: true,
      },
    });
    const history = historyTurns
      .reverse()
      .map((turn) => ({
        userTranscript: turn.userTranscriptText,
        assistantText: turn.assistantText,
      }));

    const llmStartedAt = Date.now();
    const onboardingResult = await runOnboardingTurn({
      transcript: transcribed.text,
      draft: parseOnboardingDraft(session.draft),
      promptTemplatePath: onboardingPromptBinding.templatePath,
      history,
      profile: {
        name: params.user.displayName ?? null,
        ageRange: "unknown",
        sex: "unknown",
      },
    });
    llmLatencyMs = Date.now() - llmStartedAt;
    draftToSave = onboardingResult.draft;
    if (onboardingResult.safetyFlag) {
      const safeResponse = getSafetyResponse();
      assistantText = safeResponse.message;
      readyToEnd = true;
      safetyPayload = {
        flagged: true,
        reason: "self_harm",
        safeResponse,
      };
    } else {
      assistantText = onboardingResult.assistantText;
      readyToEnd = onboardingResult.readyToEnd;
      safetyPayload = {
        flagged: false,
        reason: "none",
        safeResponse: null,
      };
    }
  } else {
    const llmStartedAt = Date.now();
    const coach = await runRubricCoach({
      promptText,
      responseText: transcribed.text,
    });
    llmLatencyMs = Date.now() - llmStartedAt;
    assistantText = coach.coachText;
    readyToEnd = true;
    safetyPayload = {
      flagged: false,
      reason: "none",
      safeResponse: null,
    };
  }

  const tts = await synthesizeWithElevenlabs({
    text: assistantText,
    voiceId: session.ttsVoiceId,
    blobPath: `voice/${params.user.id}/${session.id}/turn-${turnIndex}.mp3`,
  });

  const newExpiresAt = getNextExpiry();
  const createdTurn = await prisma.voiceTurn.create({
    data: {
      sessionId: session.id,
      userId: params.user.id,
      turnIndex,
      clientTurnId: params.clientTurnId,
      requestHash,
      userTranscriptText: transcribed.text,
      assistantText,
      assistantAudioUrl: tts.audioUrl,
      assistantAudioMimeType: tts.audioMimeType,
      assistantAudioExpiresAt: tts.audioExpiresAt ? new Date(tts.audioExpiresAt) : null,
      ttsAvailable: tts.ttsAvailable,
      safetyFlagged: safetyPayload.flagged,
      safetyReason: safetyPayload.reason,
      safeResponse: safetyPayload.safeResponse
        ? toJsonInput(safetyPayload.safeResponse)
        : undefined,
      sttLatencyMs: transcribed.latencyMs,
      llmLatencyMs,
      ttsLatencyMs: tts.latencyMs,
      totalLatencyMs: transcribed.latencyMs + llmLatencyMs + tts.latencyMs,
    },
  });

  const body = {
    session: {
      id: session.id,
      state: "active",
      readyToEnd,
      safetyFlagged: session.safetyFlagged || safetyPayload.flagged,
      nextTurnIndex: turnIndex + 1,
      expiresAt: newExpiresAt.toISOString(),
    },
    turn: {
      id: createdTurn.id,
      index: turnIndex,
      clientTurnId: params.clientTurnId,
      userTranscript: {
        text: transcribed.text,
      },
      assistant: makeAssistantPayload(assistantText, tts),
      safety: safetyPayload,
    },
  };

  await prisma.$transaction([
    prisma.voiceSession.update({
      where: { id: session.id },
      data: {
        expiresAt: newExpiresAt,
        draft: draftToSave ? toJsonInput(draftToSave) : undefined,
        safetyFlagged: session.safetyFlagged || safetyPayload.flagged,
        safetyReason: safetyPayload.flagged
          ? safetyPayload.reason
          : session.safetyReason,
        safeResponse: safetyPayload.safeResponse
          ? toJsonInput(safetyPayload.safeResponse)
          : undefined,
      },
    }),
    prisma.voiceTurn.update({
      where: { id: createdTurn.id },
      data: {
        responseJson: toJsonInput(body),
      },
    }),
  ]);

  return { status: 200, body };
}

export async function endVoiceSession(params: {
  user: User;
  sessionId: string;
  clientEndId: string;
  reason?: string | null;
  commit?: boolean;
}): Promise<{ status: number; body: unknown }> {
  const commit = params.commit ?? true;
  const session = await loadSessionOrThrow(params.sessionId, params.user.id);

  const requestHash = hashObject({
    sessionId: params.sessionId,
    clientEndId: params.clientEndId,
    reason: params.reason ?? null,
    commit,
  });

  if (session.endClientId) {
    if (session.endClientId !== params.clientEndId) {
      throw new VoiceServiceError(
        "session_inactive",
        409,
        false,
        "Session is already ended."
      );
    }
    if (session.endRequestHash !== requestHash) {
      throw new VoiceServiceError(
        "idempotency_conflict",
        409,
        false,
        "This clientEndId was already used with different data."
      );
    }
    if (session.endResponseJson) {
      return { status: 200, body: session.endResponseJson };
    }
    throw new VoiceServiceError("internal_error", 500, true, "Unable to replay end response.");
  }

  await ensureSessionActive(session);

  let result: { reflection: unknown; onboarding: unknown } = {
    reflection: null,
    onboarding: null,
  };

  if (commit) {
    if (session.flow === "FIRST_REFLECTION") {
      const turns = await prisma.voiceTurn.findMany({
        where: { sessionId: session.id },
        orderBy: { turnIndex: "asc" },
        select: { userTranscriptText: true },
      });

      const responseText = turns
        .map((t) => t.userTranscriptText.trim())
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!responseText) {
        throw new VoiceServiceError(
          "reflection_empty",
          422,
          false,
          "No reflection transcript available to save."
        );
      }
      if (responseText.length > 2000) {
        throw new VoiceServiceError(
          "reflection_too_long",
          400,
          false,
          "Reflection text must be 2000 characters or less."
        );
      }

      const dateLocal = ensureDateLocal(session.dateLocal, params.user.timezone);
      result = {
        reflection: await finalizeVoiceReflection({
          userId: params.user.id,
          dateLocal,
          responseText,
        }),
        onboarding: null,
      };
    } else {
      const draft = parseOnboardingDraft(session.draft);
      if (!isOnboardingComplete(draft)) {
        throw new VoiceServiceError(
          "onboarding_incomplete",
          422,
          false,
          "Onboarding details are incomplete."
        );
      }

      const displayName =
        typeof draft.displayName === "string"
          ? draft.displayName.trim()
          : (params.user.displayName ?? "").trim();
      if (displayName.length > 50) {
        throw new VoiceServiceError(
          "onboarding_incomplete",
          422,
          false,
          "Display name is invalid."
        );
      }

      const timezone =
        draft.timezone && isValidTimezone(draft.timezone)
          ? draft.timezone
          : params.user.timezone ?? null;
      const reflectionReminderEnabled =
        typeof draft.reflectionReminderEnabled === "boolean"
          ? draft.reflectionReminderEnabled
          : params.user.reflectionReminderEnabled;
      const reflectionReminderTimeLocal = reflectionReminderEnabled
        ? draft.reflectionReminderTimeLocal ??
          params.user.reflectionReminderTimeLocal ??
          null
        : null;

      const updatedUser = await prisma.user.update({
        where: { id: params.user.id },
        data: {
          displayName: displayName || null,
          timezone,
          reflectionReminderEnabled,
          reflectionReminderTimeLocal,
          onboardingCompletedAt: params.user.onboardingCompletedAt ?? new Date(),
        },
      });

      result = {
        reflection: null,
        onboarding: {
          completed: true,
          user: {
            id: updatedUser.id,
            displayName: updatedUser.displayName,
            timezone: updatedUser.timezone,
            onboardingCompleted: updatedUser.onboardingCompletedAt !== null,
            reflectionReminderEnabled: updatedUser.reflectionReminderEnabled,
            reflectionReminderTimeLocal: updatedUser.reflectionReminderTimeLocal,
          },
        },
      };
    }
  }

  const endedAt = new Date();
  const responseBody = {
    session: {
      id: session.id,
      flow: toApiFlow(session.flow),
      state: "ended",
      endedAt: endedAt.toISOString(),
    },
    result,
  };

  await prisma.voiceSession.update({
    where: { id: session.id },
    data: {
      state: commit ? "ENDED" : "ABORTED",
      endedAt,
      result: toJsonInput(result),
      endClientId: params.clientEndId,
      endRequestHash: requestHash,
      endResponseJson: toJsonInput(responseBody),
    },
  });

  return { status: 200, body: responseBody };
}
