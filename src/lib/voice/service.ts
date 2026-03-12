import { Prisma } from "@prisma/client";
import type { User, VoiceFlow, VoiceSession, VoiceTurn } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureDateLocal, validateDateLocal } from "@/lib/bluum/dateLocal";
import { getOrCreateDailyStatus } from "@/lib/bluum/dailyStatus";
import { getSafetyResponse, runSafetyGate } from "@/lib/bluum/coaching";
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
  FIRST_REFLECTION_DAY0_HANDSHAKE_TEXT,
  runFirstReflectionDay0Turn,
} from "@/lib/voice/firstReflectionDay0Flow";
import {
  REFLECTION_CORE_HANDSHAKE_TEXT,
  runReflectionCoreTurn,
} from "@/lib/voice/reflectionCoreFlow";
import {
  getDefaultVoicePromptBinding,
  getFirstReflectionPromptBindingFromTrack,
  resolveFirstReflectionPromptBinding,
  resolveOnboardingPromptBinding,
  type VoicePromptBinding,
} from "@/lib/voice/promptRegistry";
import { synthesizeWithElevenlabs } from "@/lib/voice/providers/elevenlabs";
import { transcribeWithLemonfox } from "@/lib/voice/providers/lemonfox";
import { loadPromptMdStrict } from "@/lib/llm/openrouter";

export type VoiceFlowInput = "onboarding" | "first_reflection";
export type ReflectionTrackInput = "day0" | "core";

interface AssistantPayload {
  text: string;
  audioUrl: string | null;
  audioMimeType: string | null;
  audioExpiresAt: string | null;
  ttsAvailable: boolean;
  inputMode: VoiceAssistantInputMode;
  choices: VoiceChoiceOption[] | null;
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

type VoiceTurnResponseMode = "final" | "staged" | "finalize";
type VoiceTurnInputType = "audio" | "text" | "choice";
type VoiceAssistantInputMode = "voice" | "text" | "choice";

interface VoiceChoiceOption {
  value: string;
  label: string;
}

interface VoiceAssistantInputHint {
  inputMode: VoiceAssistantInputMode;
  choices: VoiceChoiceOption[] | null;
}

const TURN_FINALIZE_LOCK_MARKER = "__TURN_FINALIZING__";
const TURN_FINALIZE_LOCK_STALE_MS = 2 * 60 * 1000;
const VOICE_TEXT_INPUT_MIN_CHARS = 1;
const VOICE_TEXT_INPUT_MAX_CHARS = 500;

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

function parseFirstReflectionPracticeMode(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const draft = value as Record<string, unknown>;
  return draft.practiceMode === true;
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
  },
  inputHint?: VoiceAssistantInputHint
): AssistantPayload {
  return {
    text,
    audioUrl: tts.audioUrl,
    audioMimeType: tts.audioMimeType,
    audioExpiresAt: tts.audioExpiresAt,
    ttsAvailable: tts.ttsAvailable,
    inputMode: inputHint?.inputMode ?? "voice",
    choices: inputHint?.inputMode === "choice" ? inputHint.choices ?? [] : null,
  };
}

function makePendingTurnBody(params: {
  session: VoiceSession;
  turnId: string;
  turnIndex: number;
  clientTurnId: string;
  transcript: string;
  inputType: VoiceTurnInputType;
  expiresAt: Date;
}): unknown {
  return {
    session: {
      id: params.session.id,
      state: "active",
      readyToEnd: false,
      safetyFlagged: params.session.safetyFlagged,
      nextTurnIndex: params.turnIndex + 1,
      expiresAt: params.expiresAt.toISOString(),
    },
    turn: {
      id: params.turnId,
      index: params.turnIndex,
      clientTurnId: params.clientTurnId,
      userTranscript: {
        text: params.transcript,
      },
      inputType: params.inputType,
      assistantPending: true,
    },
  };
}

function normalizeTextInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length < VOICE_TEXT_INPUT_MIN_CHARS) {
    return null;
  }
  if (trimmed.length > VOICE_TEXT_INPUT_MAX_CHARS) {
    throw new VoiceServiceError(
      "validation_error",
      400,
      false,
      `textInput must be ${VOICE_TEXT_INPUT_MIN_CHARS}-${VOICE_TEXT_INPUT_MAX_CHARS} characters after trimming.`
    );
  }
  return trimmed;
}

function normalizeChoiceValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function parseAssistantInputHintFromResponseJson(
  responseJson: unknown
): VoiceAssistantInputHint {
  if (!responseJson || typeof responseJson !== "object") {
    return { inputMode: "voice", choices: null };
  }

  const payload = responseJson as Record<string, unknown>;
  const assistantFromTurn =
    payload.turn &&
    typeof payload.turn === "object" &&
    (payload.turn as Record<string, unknown>).assistant &&
    typeof (payload.turn as Record<string, unknown>).assistant === "object"
      ? ((payload.turn as Record<string, unknown>).assistant as Record<
          string,
          unknown
        >)
      : null;

  const assistantFromStart =
    payload.assistant && typeof payload.assistant === "object"
      ? (payload.assistant as Record<string, unknown>)
      : null;

  const assistant = assistantFromTurn ?? assistantFromStart;
  if (!assistant) {
    return { inputMode: "voice", choices: null };
  }

  const modeRaw = assistant.inputMode;
  const inputMode: VoiceAssistantInputMode =
    modeRaw === "text" || modeRaw === "choice" ? modeRaw : "voice";

  if (inputMode !== "choice") {
    return { inputMode, choices: null };
  }

  const choicesRaw = assistant.choices;
  if (!Array.isArray(choicesRaw)) {
    return { inputMode, choices: [] };
  }

  const choices = choicesRaw
    .map((choice) => {
      if (!choice || typeof choice !== "object") {
        return null;
      }
      const item = choice as Record<string, unknown>;
      const value = typeof item.value === "string" ? item.value.trim() : "";
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (!value || !label) {
        return null;
      }
      return { value, label };
    })
    .filter((choice): choice is VoiceChoiceOption => Boolean(choice));

  return { inputMode, choices };
}

async function getExpectedInputHintForTurn(params: {
  session: VoiceSession;
  turnIndex: number;
}): Promise<VoiceAssistantInputHint> {
  if (params.turnIndex <= 1) {
    return parseAssistantInputHintFromResponseJson(params.session.startResponseJson);
  }

  const previousTurn = await prisma.voiceTurn.findUnique({
    where: {
      sessionId_turnIndex: {
        sessionId: params.session.id,
        turnIndex: params.turnIndex - 1,
      },
    },
    select: { responseJson: true },
  });

  return parseAssistantInputHintFromResponseJson(previousTurn?.responseJson ?? null);
}

function deriveOnboardingAssistantInputHint(
  draft: OnboardingDraft,
  readyToEnd: boolean
): VoiceAssistantInputHint {
  if (readyToEnd) {
    return { inputMode: "voice", choices: null };
  }
  if (!draft.displayName) {
    return { inputMode: "text", choices: null };
  }
  if (!draft.timezone) {
    return { inputMode: "text", choices: null };
  }
  if (
    draft.reflectionReminderEnabled === null ||
    draft.reflectionReminderEnabled === undefined
  ) {
    return {
      inputMode: "choice",
      choices: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    };
  }
  if (draft.reflectionReminderEnabled && !draft.reflectionReminderTimeLocal) {
    return { inputMode: "text", choices: null };
  }
  return { inputMode: "voice", choices: null };
}

async function acquireTurnFinalizeLock(turnId: string): Promise<{
  status: "acquired" | "finalized" | "in_progress";
  turn: VoiceTurn;
}> {
  const staleBefore = new Date(Date.now() - TURN_FINALIZE_LOCK_STALE_MS);

  const claimed = await prisma.voiceTurn.updateMany({
    where: {
      id: turnId,
      responseJson: { equals: Prisma.AnyNull },
      OR: [
        { assistantText: "" },
        {
          assistantText: TURN_FINALIZE_LOCK_MARKER,
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      assistantText: TURN_FINALIZE_LOCK_MARKER,
    },
  });

  const current = await prisma.voiceTurn.findUnique({
    where: { id: turnId },
  });
  if (!current) {
    throw new VoiceServiceError(
      "turn_not_found",
      404,
      false,
      "Turn not found for finalize."
    );
  }

  if (current.responseJson) {
    return { status: "finalized", turn: current };
  }

  if (claimed.count > 0) {
    return { status: "acquired", turn: current };
  }

  return { status: "in_progress", turn: current };
}

async function releaseTurnFinalizeLock(turnId: string): Promise<void> {
  await prisma.voiceTurn.updateMany({
    where: {
      id: turnId,
      responseJson: { equals: Prisma.AnyNull },
      assistantText: TURN_FINALIZE_LOCK_MARKER,
    },
    data: {
      assistantText: "",
    },
  });
}

function getOnboardingStartAudioFromEnv(): AudioPayloadLike | null {
  const audioUrl = process.env.VOICE_ONBOARDING_HANDSHAKE_URL?.trim();
  if (!audioUrl) {
    return null;
  }

  const sharedMime = process.env.VOICE_HANDSHAKE_MIME?.trim();

  return {
    audioUrl,
    audioMimeType:
      process.env.VOICE_ONBOARDING_HANDSHAKE_MIME?.trim() ||
      sharedMime ||
      "audio/mpeg",
    audioExpiresAt: null,
    ttsAvailable: true,
  };
}

function getFirstReflectionDay0StartAudioFromEnv(): AudioPayloadLike | null {
  const audioUrl = process.env.VOICE_FIRST_REFLECTION_DAY0_HANDSHAKE_URL?.trim();
  if (!audioUrl) {
    return null;
  }

  const sharedMime = process.env.VOICE_HANDSHAKE_MIME?.trim();

  return {
    audioUrl,
    audioMimeType:
      process.env.VOICE_FIRST_REFLECTION_DAY0_HANDSHAKE_MIME?.trim() ||
      sharedMime ||
      "audio/mpeg",
    audioExpiresAt: null,
    ttsAvailable: true,
  };
}

function getReflectionCoreStartAudioFromEnv(): AudioPayloadLike | null {
  const audioUrl = process.env.VOICE_REFLECTION_CORE_HANDSHAKE_URL?.trim();
  if (!audioUrl) {
    return null;
  }

  const sharedMime = process.env.VOICE_HANDSHAKE_MIME?.trim();

  return {
    audioUrl,
    audioMimeType:
      process.env.VOICE_REFLECTION_CORE_HANDSHAKE_MIME?.trim() ||
      sharedMime ||
      "audio/mpeg",
    audioExpiresAt: null,
    ttsAvailable: true,
  };
}

function getFirstReflectionTrackFromPromptKey(
  promptKey: string | null
): ReflectionTrackInput {
  if (promptKey === "voice_reflection_core") {
    return "core";
  }
  return "day0";
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
  reflectionTrack?: ReflectionTrackInput | null;
  practiceMode?: boolean | null;
  clientSessionId: string;
  dateLocal?: string | null;
  locale?: string | null;
  ttsVoiceId?: string | null;
}): Promise<{ status: number; body: unknown }> {
  const firstReflectionPersistenceEnabled =
    process.env.VOICE_FIRST_REFLECTION_PERSISTENCE === "true";
  const resolvedPracticeMode =
    params.flow === "first_reflection"
      ? firstReflectionPersistenceEnabled
        ? params.practiceMode !== false
        : true
      : false;

  const normalized = {
    flow: params.flow,
    reflectionTrack: params.reflectionTrack ?? null,
    practiceMode: resolvedPracticeMode,
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
  let onboardingDraft: OnboardingDraft | null = null;
  let sessionDraft: unknown = undefined;

  if (dbFlow === "FIRST_REFLECTION") {
    if (resolvedPracticeMode) {
      dateLocal = null;
      sessionDraft = { practiceMode: true };
    } else {
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
      await getOrCreateDailyStatus(params.user.id, dateLocal);
    }
    const reflectionPromptBinding = getFirstReflectionPromptBindingFromTrack(
      params.reflectionTrack
    );

    loadPromptMdStrict(reflectionPromptBinding.templatePath);
    promptId = reflectionPromptBinding.key;
    promptText = reflectionPromptBinding.version;
  } else {
    onboardingDraft = getBaseOnboardingDraft(params.user);
    sessionDraft = onboardingDraft;
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
      draft: sessionDraft !== undefined ? toJsonInput(sessionDraft) : undefined,
    },
  });

  const reflectionTrack = getFirstReflectionTrackFromPromptKey(promptId);
  const assistantText =
    dbFlow === "FIRST_REFLECTION"
      ? reflectionTrack === "core"
        ? REFLECTION_CORE_HANDSHAKE_TEXT
        : FIRST_REFLECTION_DAY0_HANDSHAKE_TEXT
      : getOnboardingWelcomeText(onboardingDraft ?? {});

  let tts: AudioPayloadLike;
  if (dbFlow === "ONBOARDING") {
    tts =
      getOnboardingStartAudioFromEnv() ??
      (await synthesizeWithElevenlabs({
        text: assistantText,
        voiceId: params.ttsVoiceId ?? null,
        blobPath: `voice/${params.user.id}/${session.id}/start.mp3`,
      }));
  } else if (dbFlow === "FIRST_REFLECTION") {
    tts = reflectionTrack === "core"
      ? getReflectionCoreStartAudioFromEnv() ??
        (await synthesizeWithElevenlabs({
          text: assistantText,
          voiceId: params.ttsVoiceId ?? null,
          blobPath: `voice/${params.user.id}/${session.id}/start.mp3`,
        }))
      : getFirstReflectionDay0StartAudioFromEnv() ??
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
      reflectionTrack: dbFlow === "FIRST_REFLECTION" ? reflectionTrack : null,
      state: "active",
      dateLocal,
      expiresAt: session.expiresAt.toISOString(),
      nextTurnIndex: 1,
      readyToEnd: false,
      practiceMode: dbFlow === "FIRST_REFLECTION" ? resolvedPracticeMode : null,
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

async function computeAssistantTurn(params: {
  session: VoiceSession;
  user: User;
  transcript: string;
  turnIndex: number;
}): Promise<{
  assistantText: string;
  readyToEnd: boolean;
  safetyPayload: SafetyPayload;
  draftToSave: unknown;
  llmLatencyMs: number;
  inputHint: VoiceAssistantInputHint;
}> {
  const promptText =
    params.session.flow === "FIRST_REFLECTION"
      ? "Voice first reflection conversation"
      : "Voice onboarding conversation";

  const safetyGate = await runSafetyGate({
    promptText,
    responseText: params.transcript,
  });

  let assistantText: string;
  let readyToEnd: boolean;
  let draftToSave: unknown = params.session.draft;
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
    return {
      assistantText,
      readyToEnd,
      safetyPayload,
      draftToSave,
      llmLatencyMs,
      inputHint: { inputMode: "voice", choices: null },
    };
  }

  if (params.session.flow === "ONBOARDING") {
    let onboardingPromptBinding: VoicePromptBinding;
    try {
      onboardingPromptBinding = resolveOnboardingPromptBinding({
        promptKey: params.session.promptId,
        promptVersion: params.session.promptText,
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
      where: {
        sessionId: params.session.id,
        turnIndex: { lt: params.turnIndex },
      },
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
      transcript: params.transcript,
      draft: parseOnboardingDraft(params.session.draft),
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

    return {
      assistantText,
      readyToEnd,
      safetyPayload,
      draftToSave,
      llmLatencyMs,
      inputHint: deriveOnboardingAssistantInputHint(
        parseOnboardingDraft(draftToSave),
        readyToEnd
      ),
    };
  }

  let firstReflectionPromptBinding: VoicePromptBinding;
  try {
    firstReflectionPromptBinding = resolveFirstReflectionPromptBinding({
      promptKey: params.session.promptId,
      promptVersion: params.session.promptText,
    });
  } catch {
    throw new VoiceServiceError(
      "internal_error",
      500,
      true,
      "First reflection prompt binding is invalid."
    );
  }

  const historyTurns = await prisma.voiceTurn.findMany({
    where: {
      sessionId: params.session.id,
      turnIndex: { lt: params.turnIndex },
    },
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
  const reflectionTrack = getFirstReflectionTrackFromPromptKey(
    firstReflectionPromptBinding.key
  );
  const firstReflectionResult =
    reflectionTrack === "core"
      ? await runReflectionCoreTurn({
          transcript: params.transcript,
          promptTemplatePath: firstReflectionPromptBinding.templatePath,
          history,
          profile: {
            name: params.user.displayName ?? null,
            ageRange: "unknown",
            sex: "unknown",
          },
        })
      : await runFirstReflectionDay0Turn({
          transcript: params.transcript,
          promptTemplatePath: firstReflectionPromptBinding.templatePath,
          history,
          profile: {
            name: params.user.displayName ?? null,
            ageRange: "unknown",
            sex: "unknown",
          },
        });
  llmLatencyMs = Date.now() - llmStartedAt;

  if (firstReflectionResult.safetyFlag) {
    const safeResponse = getSafetyResponse();
    assistantText = safeResponse.message;
    readyToEnd = true;
    safetyPayload = {
      flagged: true,
      reason: "self_harm",
      safeResponse,
    };
  } else {
    assistantText = firstReflectionResult.assistantText;
    readyToEnd = firstReflectionResult.readyToEnd;
    safetyPayload = {
      flagged: false,
      reason: "none",
      safeResponse: null,
    };
  }

  return {
    assistantText,
    readyToEnd,
    safetyPayload,
    draftToSave,
    llmLatencyMs,
    inputHint: { inputMode: "voice", choices: null },
  };
}

async function finalizeVoiceTurn(params: {
  session: VoiceSession;
  user: User;
  turn: VoiceTurn | null;
  transcript: string;
  sttLatencyMs: number;
  inputType: VoiceTurnInputType;
  createInput?: {
    clientTurnId: string;
    requestHash: string;
    turnIndex: number;
  };
}): Promise<unknown> {
  const turnIndex = params.turn?.turnIndex ?? params.createInput?.turnIndex;
  if (!turnIndex) {
    throw new VoiceServiceError("internal_error", 500, true, "Invalid turn index.");
  }

  const assistantResult = await computeAssistantTurn({
    session: params.session,
    user: params.user,
    transcript: params.transcript,
    turnIndex,
  });

  const tts = await synthesizeWithElevenlabs({
    text: assistantResult.assistantText,
    voiceId: params.session.ttsVoiceId,
    blobPath: `voice/${params.user.id}/${params.session.id}/turn-${turnIndex}.mp3`,
  });

  const newExpiresAt = getNextExpiry();

  const upsertedTurn =
    params.turn ??
    (await prisma.voiceTurn.create({
      data: {
        sessionId: params.session.id,
        userId: params.user.id,
        turnIndex,
        clientTurnId: params.createInput!.clientTurnId,
        requestHash: params.createInput!.requestHash,
        userTranscriptText: params.transcript,
        assistantText: assistantResult.assistantText,
        assistantAudioUrl: tts.audioUrl,
        assistantAudioMimeType: tts.audioMimeType,
        assistantAudioExpiresAt: tts.audioExpiresAt
          ? new Date(tts.audioExpiresAt)
          : null,
        ttsAvailable: tts.ttsAvailable,
        safetyFlagged: assistantResult.safetyPayload.flagged,
        safetyReason: assistantResult.safetyPayload.reason,
        safeResponse: assistantResult.safetyPayload.safeResponse
          ? toJsonInput(assistantResult.safetyPayload.safeResponse)
          : undefined,
        sttLatencyMs: params.sttLatencyMs,
        llmLatencyMs: assistantResult.llmLatencyMs,
        ttsLatencyMs: tts.latencyMs,
        totalLatencyMs:
          params.sttLatencyMs + assistantResult.llmLatencyMs + tts.latencyMs,
      },
    }));

  const body = {
    session: {
      id: params.session.id,
      state: "active",
      readyToEnd: assistantResult.readyToEnd,
      safetyFlagged:
        params.session.safetyFlagged || assistantResult.safetyPayload.flagged,
      nextTurnIndex: turnIndex + 1,
      expiresAt: newExpiresAt.toISOString(),
    },
    turn: {
      id: upsertedTurn.id,
      index: turnIndex,
      clientTurnId: upsertedTurn.clientTurnId,
      userTranscript: {
        text: params.transcript,
      },
      inputType: params.inputType,
      assistant: makeAssistantPayload(
        assistantResult.assistantText,
        tts,
        assistantResult.inputHint
      ),
      safety: assistantResult.safetyPayload,
    },
  };

  await prisma.$transaction([
    prisma.voiceSession.update({
      where: { id: params.session.id },
      data: {
        expiresAt: newExpiresAt,
        draft: assistantResult.draftToSave
          ? toJsonInput(assistantResult.draftToSave)
          : undefined,
        safetyFlagged:
          params.session.safetyFlagged || assistantResult.safetyPayload.flagged,
        safetyReason: assistantResult.safetyPayload.flagged
          ? assistantResult.safetyPayload.reason
          : params.session.safetyReason,
        safeResponse: assistantResult.safetyPayload.safeResponse
          ? toJsonInput(assistantResult.safetyPayload.safeResponse)
          : undefined,
      },
    }),
    prisma.voiceTurn.update({
      where: { id: upsertedTurn.id },
      data: {
        assistantText: assistantResult.assistantText,
        assistantAudioUrl: tts.audioUrl,
        assistantAudioMimeType: tts.audioMimeType,
        assistantAudioExpiresAt: tts.audioExpiresAt
          ? new Date(tts.audioExpiresAt)
          : null,
        ttsAvailable: tts.ttsAvailable,
        safetyFlagged: assistantResult.safetyPayload.flagged,
        safetyReason: assistantResult.safetyPayload.reason,
        safeResponse: assistantResult.safetyPayload.safeResponse
          ? toJsonInput(assistantResult.safetyPayload.safeResponse)
          : undefined,
        llmLatencyMs: assistantResult.llmLatencyMs,
        ttsLatencyMs: tts.latencyMs,
        totalLatencyMs:
          params.sttLatencyMs + assistantResult.llmLatencyMs + tts.latencyMs,
        responseJson: toJsonInput(body),
      },
    }),
  ]);

  return body;
}

export async function processVoiceTurn(params: {
  user: User;
  sessionId: string;
  clientTurnId: string;
  audio: Buffer | null;
  mimeType: string | null;
  textInput?: string | null;
  choiceValue?: string | null;
  audioDurationMs?: number | null;
  locale?: string | null;
  responseMode?: VoiceTurnResponseMode;
}): Promise<{ status: number; body: unknown }> {
  const responseMode = params.responseMode ?? "final";
  const normalizedTextInput = normalizeTextInput(params.textInput);
  const normalizedChoiceValue = normalizeChoiceValue(params.choiceValue);
  const hasAudioInput = Boolean(params.audio && params.mimeType);

  const session = await ensureSessionActive(
    await loadSessionOrThrow(params.sessionId, params.user.id)
  );

  const existingTurn = await prisma.voiceTurn.findUnique({
    where: {
      sessionId_clientTurnId: {
        sessionId: session.id,
        clientTurnId: params.clientTurnId,
      },
    },
  });

  if (responseMode === "finalize") {
    if (hasAudioInput || normalizedTextInput || normalizedChoiceValue) {
      throw new VoiceServiceError(
        "validation_error",
        400,
        false,
        "Finalize mode does not accept audio, textInput, or choiceValue."
      );
    }
    if (!existingTurn) {
      throw new VoiceServiceError(
        "turn_not_found",
        404,
        false,
        "Turn not found for finalize."
      );
    }

    if (existingTurn.responseJson) {
      return { status: 200, body: existingTurn.responseJson };
    }

    const lock = await acquireTurnFinalizeLock(existingTurn.id);
    if (lock.status === "finalized") {
      return { status: 200, body: lock.turn.responseJson };
    }
    if (lock.status === "in_progress") {
      throw new VoiceServiceError(
        "turn_finalize_in_progress",
        409,
        true,
        "Turn finalize is in progress. Retry shortly."
      );
    }

    try {
      const finalized = await finalizeVoiceTurn({
        session,
        user: params.user,
        turn: lock.turn,
        transcript: lock.turn.userTranscriptText,
        sttLatencyMs: lock.turn.sttLatencyMs ?? 0,
        inputType: "audio",
      });
      return { status: 200, body: finalized };
    } catch (err) {
      await releaseTurnFinalizeLock(existingTurn.id);
      throw err;
    }
  }

  if (responseMode === "staged") {
    if (!hasAudioInput) {
      throw new VoiceServiceError(
        "unsupported_response_mode",
        400,
        false,
        "Staged mode requires audio input."
      );
    }
    if (normalizedTextInput || normalizedChoiceValue) {
      throw new VoiceServiceError(
        "turn_input_conflict",
        400,
        false,
        "Provide exactly one of audio, textInput, or choiceValue."
      );
    }
  } else {
    const providedCount =
      Number(hasAudioInput) +
      Number(Boolean(normalizedTextInput)) +
      Number(Boolean(normalizedChoiceValue));
    if (providedCount === 0) {
      throw new VoiceServiceError(
        "turn_input_required",
        400,
        false,
        "Provide exactly one of audio, textInput, or choiceValue."
      );
    }
    if (providedCount > 1) {
      throw new VoiceServiceError(
        "turn_input_conflict",
        400,
        false,
        "Provide exactly one of audio, textInput, or choiceValue."
      );
    }
  }

  let inputType: VoiceTurnInputType;
  if (hasAudioInput) {
    inputType = "audio";
  } else if (normalizedTextInput) {
    inputType = "text";
  } else {
    inputType = "choice";
  }

  if (inputType === "audio" && (!params.audio || !params.mimeType)) {
    throw new VoiceServiceError(
      "validation_error",
      400,
      false,
      "audio file is required."
    );
  }
  if (inputType === "audio" && params.mimeType && !ACCEPTED_AUDIO_MIME_TYPES.has(params.mimeType)) {
    throw new VoiceServiceError(
      "unsupported_media_type",
      415,
      false,
      "Unsupported audio format."
    );
  }
  if (inputType === "audio" && params.audio && params.audio.byteLength > VOICE_MAX_AUDIO_BYTES) {
    throw new VoiceServiceError(
      "audio_too_large",
      413,
      false,
      "Audio file is too large."
    );
  }
  if (
    inputType === "audio" &&
    params.audioDurationMs &&
    params.audioDurationMs > VOICE_MAX_AUDIO_MS
  ) {
    throw new VoiceServiceError(
      "audio_too_long",
      400,
      false,
      "Audio duration exceeds limit."
    );
  }

  const requestHash = hashObject({
    sessionId: params.sessionId,
    clientTurnId: params.clientTurnId,
    responseMode,
    inputType,
    textInput: inputType === "text" ? normalizedTextInput : null,
    choiceValue: inputType === "choice" ? normalizedChoiceValue : null,
    locale: params.locale ?? null,
    audioDurationMs: params.audioDurationMs ?? null,
    audioHash: inputType === "audio" && params.audio ? hashBuffer(params.audio) : null,
  });

  if (existingTurn) {
    if (!existingTurn.responseJson) {
      if (responseMode === "staged" && existingTurn.requestHash === requestHash) {
        const replayBody = makePendingTurnBody({
          session,
          turnId: existingTurn.id,
          turnIndex: existingTurn.turnIndex,
          clientTurnId: existingTurn.clientTurnId,
          transcript: existingTurn.userTranscriptText,
          inputType: "audio",
          expiresAt: session.expiresAt,
        });
        return { status: 200, body: replayBody };
      }

      if (responseMode === "final") {
        throw new VoiceServiceError(
          "turn_pending_finalize",
          409,
          false,
          "Turn is pending finalization. Call /turn with responseMode=finalize."
        );
      }
    }

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

  const currentTurnCount = await prisma.voiceTurn.count({
    where: { sessionId: session.id },
  });
  const turnIndex = currentTurnCount + 1;

  let transcript: string;
  let sttLatencyMs = 0;

  if (inputType === "audio") {
    const transcribed = await transcribeWithLemonfox({
      audio: params.audio!,
      mimeType: params.mimeType!,
      locale: params.locale ?? session.locale ?? DEFAULT_VOICE_LOCALE,
    });
    transcript = transcribed.text;
    sttLatencyMs = transcribed.latencyMs;
  } else if (inputType === "text") {
    transcript = normalizedTextInput!;
  } else {
    const expectedInputHint = await getExpectedInputHintForTurn({
      session,
      turnIndex,
    });
    const expectedChoices = expectedInputHint.choices ?? [];
    if (expectedInputHint.inputMode !== "choice" || !expectedChoices.length) {
      throw new VoiceServiceError(
        "invalid_choice_value",
        422,
        false,
        "choiceValue is not valid for the current step."
      );
    }
    const isValidChoice = expectedChoices.some(
      (choice) => choice.value === normalizedChoiceValue
    );
    if (!isValidChoice) {
      throw new VoiceServiceError(
        "invalid_choice_value",
        422,
        false,
        "choiceValue is not valid for the current step."
      );
    }
    transcript = normalizedChoiceValue!;
  }

  const newExpiresAt = getNextExpiry();

  if (responseMode === "staged") {
    const stagedTurn = await prisma.voiceTurn.create({
      data: {
        sessionId: session.id,
        userId: params.user.id,
        turnIndex,
        clientTurnId: params.clientTurnId,
        requestHash,
        userTranscriptText: transcript,
        assistantText: "",
        ttsAvailable: false,
        sttLatencyMs,
      },
    });

    await prisma.voiceSession.update({
      where: { id: session.id },
      data: { expiresAt: newExpiresAt },
    });

    const stagedBody = makePendingTurnBody({
      session,
      turnId: stagedTurn.id,
      turnIndex,
      clientTurnId: params.clientTurnId,
      transcript,
      inputType,
      expiresAt: newExpiresAt,
    });
    return { status: 200, body: stagedBody };
  }

  const finalized = await finalizeVoiceTurn({
    session,
    user: params.user,
    turn: null,
    transcript,
    sttLatencyMs,
    inputType,
    createInput: {
      clientTurnId: params.clientTurnId,
      requestHash,
      turnIndex,
    },
  });
  return { status: 200, body: finalized };
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
      if (parseFirstReflectionPracticeMode(session.draft)) {
        result = {
          reflection: null,
          onboarding: null,
        };
      } else {
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
      }
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
