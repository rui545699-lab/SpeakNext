const { STATES } = require('./constants');
const questions = require('../mock/questions');
const { firstUseProfile } = require('../mock/profile');
const { getSafeErrorDetails } = require('./safe-error-details');

const STORAGE_KEY = 'speaknext_profile_v0';
const DEBUG_MODE_KEY = 'speaknext_debug_diagnosis_v0';
const LEGACY_STORAGE_KEY = 'speakloop_profile_v0';
const LEGACY_DEBUG_MODE_KEY = 'speakloop_debug_diagnosis_v0';
const COMPLETED_SESSION_IDS_KEY = 'speaknext_completed_session_ids';
const COMPLETED_ROUND_COUNT_KEY = 'speaknext_completed_round_count';
const VALID_TRANSITIONS = {
  HOME: [STATES.RECORDING, STATES.PROFILE],
  RECORDING: [STATES.PROCESSING, STATES.HOME],
  PROCESSING: [STATES.INSIGHT, STATES.INTERVENTION, STATES.RECORDING, STATES.HOME],
  INSIGHT: [STATES.INTERVENTION, STATES.RECORDING, STATES.SESSION_SUMMARY],
  INTERVENTION: [STATES.MICRO_RESULT, STATES.RECORDING, STATES.SESSION_SUMMARY],
  MICRO_RESULT: [STATES.RECORDING, STATES.SESSION_SUMMARY],
  SESSION_SUMMARY: [STATES.HOME],
  PROFILE: [STATES.HOME]
};

let runtime = {
  state: STATES.HOME,
  question: questions[0],
  diagnosis: null,
  sessionRound: 1,
  sessionIssues: [],
  speechDuration: 0,
  interventionResult: null,
  sessionId: '',
  roundId: '',
  audioTempFilePath: '',
  audioDurationMs: 0,
  audioFileSize: 0,
  audioFileId: '',
  transcript: '',
  wordList: [],
  signals: null,
  recordingReady: false
};

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getProfile() {
  try {
    const profile = wx.getStorageSync(STORAGE_KEY) || wx.getStorageSync(LEGACY_STORAGE_KEY);
    if (profile && !wx.getStorageSync(STORAGE_KEY)) wx.setStorageSync(STORAGE_KEY, profile);
    const normalized = Object.assign(clone(firstUseProfile), profile || {});
    normalized.skills = Object.assign(clone(firstUseProfile.skills), (profile && profile.skills) || {});
    normalized.interventions = Object.assign(clone(firstUseProfile.interventions), (profile && profile.interventions) || {});
    normalized.totalRounds = Number.isFinite(normalized.totalRounds) ? normalized.totalRounds : normalized.sessionCount;
    return normalized;
  } catch (error) {
    console.error('[TRAINING STORE] getProfile failed', getSafeErrorDetails(error));
    return clone(firstUseProfile);
  }
}

function saveProfile(profile) {
  try {
    wx.setStorageSync(STORAGE_KEY, profile);
  } catch (error) {
    console.warn('[SpeakNext] profile storage unavailable', getSafeErrorDetails(error));
  }
}

function transition(nextState, patch = {}) {
  const allowed = VALID_TRANSITIONS[runtime.state] || [];
  if (runtime.state !== nextState && allowed.indexOf(nextState) === -1) {
    console.warn(`[SpeakNext] non-standard transition ${runtime.state} -> ${nextState}`);
  }
  runtime = Object.assign({}, runtime, patch, { state: nextState });
  return getRuntime();
}

function getRuntime() {
  return clone(runtime);
}

function setQuestion(question) {
  runtime.question = question;
}

function pickNextQuestion(currentId) {
  const candidates = questions.filter((item) => item.id !== currentId);
  const next = candidates[Math.floor(Math.random() * candidates.length)] || questions[0];
  setQuestion(next);
  return next;
}

function startSession(question) {
  const nextRound = runtime.state === STATES.MICRO_RESULT ? runtime.sessionRound + 1 : 1;
  const sessionId = nextRound > 1 && runtime.sessionId ? runtime.sessionId : createId('session');
  runtime = {
    state: STATES.RECORDING,
    question: question || runtime.question || questions[0],
    diagnosis: null,
    sessionRound: nextRound,
    sessionIssues: [],
    speechDuration: 0,
    interventionResult: null,
    sessionId,
    roundId: createId('round'),
    audioTempFilePath: '',
    audioDurationMs: 0,
    audioFileSize: 0,
    audioFileId: '',
    transcript: '',
    wordList: [],
    signals: null,
    recordingReady: false
  };
  return getRuntime();
}

function setSpeechDuration(seconds) {
  runtime.speechDuration = seconds;
}

function setRecording(recording) {
  runtime.speechDuration = Number(recording.duration) || 0;
  runtime.audioTempFilePath = recording.tempFilePath || '';
  runtime.audioDurationMs = Number(recording.durationMs) || 0;
  runtime.audioFileSize = Number(recording.fileSize) || 0;
}

function setAnalysisResult(result) {
  console.log('[TRAINING STORE] setAnalysisResult input', {
    hasDiagnosis: Boolean(result && result.diagnosis),
    primaryIssue: result && result.diagnosis ? result.diagnosis.primaryIssue : '',
    transcriptLength: result && typeof result.transcript === 'string' ? result.transcript.length : 0,
    wordListLength: result && Array.isArray(result.wordList) ? result.wordList.length : 0,
    hasSignals: Boolean(result && result.signals)
  });
  runtime.diagnosis = clone(result.diagnosis);
  runtime.audioFileId = result.audioFileId || '';
  runtime.transcript = result.transcript || '';
  runtime.wordList = clone(result.wordList || []);
  runtime.signals = clone(result.signals || null);
}

function setAsrResult(result) {
  console.log('[TRAINING STORE] setAsrResult input', {
    transcriptLength: result && typeof result.transcript === 'string' ? result.transcript.length : 0,
    wordListLength: result && Array.isArray(result.wordList) ? result.wordList.length : 0,
    audioDuration: result && result.audioDuration
  });
  runtime.audioFileId = result.audioFileId || '';
  runtime.transcript = result.transcript || '';
  runtime.wordList = clone(result.wordList || []);
  runtime.speechDuration = result.audioDuration
    ? Math.max(0, Math.round(Number(result.audioDuration) / 1000))
    : runtime.speechDuration;
}

function createNextRoundPatch(question, sessionRound) {
  return {
    question,
    diagnosis: null,
    speechDuration: 0,
    interventionResult: null,
    sessionRound,
    roundId: createId('round'),
    audioTempFilePath: '',
    audioDurationMs: 0,
    audioFileSize: 0,
    audioFileId: '',
    transcript: '',
    wordList: [],
    signals: null,
    recordingReady: true
  };
}

function setDebugDiagnosisMode(mode) {
  try {
    wx.setStorageSync(DEBUG_MODE_KEY, mode || '');
  } catch (error) {
    console.error('[TRAINING STORE] setDebugDiagnosisMode failed', getSafeErrorDetails(error));
  }
}

function getDebugDiagnosisMode() {
  try {
    const mode = wx.getStorageSync(DEBUG_MODE_KEY) || wx.getStorageSync(LEGACY_DEBUG_MODE_KEY) || '';
    if (mode && !wx.getStorageSync(DEBUG_MODE_KEY)) wx.setStorageSync(DEBUG_MODE_KEY, mode);
    return mode;
  } catch (error) {
    console.error('[TRAINING STORE] getDebugDiagnosisMode failed', getSafeErrorDetails(error));
    return '';
  }
}

function setInterventionResult(result, options = {}) {
  if (!result || options.checkStatus !== 'PASS' || result.originalTaskComplete !== true) {
    console.warn('[TRAINING STORE] rejected incomplete intervention result');
    return false;
  }
  runtime.interventionResult = clone(result);
  return true;
}

function recordIntervention(issueType, interventionType) {
  runtime.sessionIssues = (runtime.sessionIssues || []).concat(issueType);
  const profile = getProfile();
  const skillKeys = {
    CONTENT_START: 'contentStart',
    CONTENT_EXPAND: 'contentExpand',
    LEXICAL_RETRIEVAL: 'lexicalRetrieval',
    INFORMATION_ORDER: 'informationOrder'
  };
  const interventionKeys = {
    NARROW_SCOPE: 'directCandidate',
    ONE_DETAIL: 'detailPrompt',
    SEMANTIC_CONTRAST: 'semanticContrast'
  };
  const skillKey = skillKeys[issueType];
  const interventionKey = interventionKeys[interventionType];
  if (skillKey && profile.skills[skillKey]) {
    profile.skills[skillKey].observedCount += 1;
    profile.skills[skillKey].successfulInterventionCount += 1;
  }
  if (interventionKey && profile.interventions[interventionKey]) {
    profile.interventions[interventionKey].used += 1;
    profile.interventions[interventionKey].success += 1;
  }
  saveProfile(profile);
  return profile;
}

function completeSession(rounds = 1) {
  const profile = getProfile();
  profile.sessionCount += 1;
  profile.totalRounds += rounds;
  saveProfile(profile);
  return profile;
}

function parseCompletedSessionIds(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];
  const seen = new Set();
  return source.filter((id) => {
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getCompletedRoundCount() {
  try {
    const ids = parseCompletedSessionIds(wx.getStorageSync(COMPLETED_SESSION_IDS_KEY));
    const stored = Number(wx.getStorageSync(COMPLETED_ROUND_COUNT_KEY));
    const count = Math.max(Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : 0, ids.length);
    if (stored !== count) wx.setStorageSync(COMPLETED_ROUND_COUNT_KEY, count);
    return count;
  } catch (error) {
    console.error('[TRAINING STORE] getCompletedRoundCount failed', getSafeErrorDetails(error));
    return 0;
  }
}

function completePracticeSession(sessionId) {
  const normalizedId = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalizedId) return { ok: false, added: false, count: getCompletedRoundCount() };
  try {
    const ids = parseCompletedSessionIds(wx.getStorageSync(COMPLETED_SESSION_IDS_KEY));
    const stored = Number(wx.getStorageSync(COMPLETED_ROUND_COUNT_KEY));
    const currentCount = Math.max(
      Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : 0,
      ids.length
    );
    if (ids.includes(normalizedId)) {
      if (stored !== currentCount) wx.setStorageSync(COMPLETED_ROUND_COUNT_KEY, currentCount);
      return { ok: true, added: false, count: currentCount };
    }
    const nextIds = ids.concat(normalizedId);
    const nextCount = currentCount + 1;
    wx.setStorageSync(COMPLETED_SESSION_IDS_KEY, nextIds);
    wx.setStorageSync(COMPLETED_ROUND_COUNT_KEY, nextCount);
    return { ok: true, added: true, count: nextCount };
  } catch (error) {
    console.error('[TRAINING STORE] completePracticeSession failed', getSafeErrorDetails(error));
    return { ok: false, added: false, count: getCompletedRoundCount() };
  }
}

function resetToHome() {
  runtime.state = STATES.HOME;
}

module.exports = {
  STORAGE_KEY,
  COMPLETED_SESSION_IDS_KEY,
  COMPLETED_ROUND_COUNT_KEY,
  transition,
  getRuntime,
  getProfile,
  saveProfile,
  setQuestion,
  pickNextQuestion,
  startSession,
  setSpeechDuration,
  setRecording,
  setAnalysisResult,
  setAsrResult,
  createNextRoundPatch,
  setInterventionResult,
  recordIntervention,
  setDebugDiagnosisMode,
  getDebugDiagnosisMode,
  completeSession,
  parseCompletedSessionIds,
  getCompletedRoundCount,
  completePracticeSession,
  resetToHome
};
