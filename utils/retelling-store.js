const materials = require('../data/retelling-materials');
const { validateMaterialBank } = require('../data/retelling-material-validator');
const { selectNextMaterial } = require('./retelling-material-selector');

validateMaterialBank(materials);

const PHASES = Object.freeze({
  READING: 'READING',
  FIRST_RECORDING: 'FIRST_RECORDING',
  FIRST_PROCESSING: 'FIRST_PROCESSING',
  MICRO_HINT: 'MICRO_HINT',
  SECOND_RECORDING: 'SECOND_RECORDING',
  SECOND_PROCESSING: 'SECOND_PROCESSING',
  RESULT: 'RESULT',
  ERROR: 'ERROR'
});

const HINT_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: '中间还缺一步',
  INCORRECT_RELATION: '先把因果关系理清楚',
  LEXICAL_RETRIEVAL: '想不到那个词也没关系',
  INFORMATION_ORDER: '按事情发生的顺序重新说',
  UNCERTAIN: '再完整说一遍',
  WORDING_PRECISION: '这里可以说得更准确',
  FORMULATION_BREAKDOWN: '把这句话完整说出来',
  CONCEPT_INACCURACY: '这里的意思有一点偏'
});

const HINT_ASSIST_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: '再完整说一遍，把这个原因补充清楚。',
  INCORRECT_RELATION: '再完整说一遍。',
  LEXICAL_RETRIEVAL: '换一种说法继续讲。',
  INFORMATION_ORDER: '再完整说一遍。',
  UNCERTAIN: '刚才还没能判断完整意思。再说一次，把原因和最后的结果连起来。',
  WORDING_PRECISION: '不用照搬原句，用自己的话把这个意思说准。',
  FORMULATION_BREAKDOWN: '意思已经有了，这次把这一句连起来说完整。',
  CONCEPT_INACCURACY: '先不用照搬原句，把这个意思重新说准确。'
});

const RETRY_SCOPES = Object.freeze({
  FULL_CONTENT: 'FULL_CONTENT',
  TARGET_EXPRESSION: 'TARGET_EXPRESSION'
});

function retryScopeForNeed(need) {
  if (need === 'PASS' || !need) return null;
  return ['WORDING_PRECISION', 'FORMULATION_BREAKDOWN'].includes(need)
    ? RETRY_SCOPES.TARGET_EXPRESSION
    : RETRY_SCOPES.FULL_CONTENT;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function initialState(material) {
  return {
    phase: PHASES.READING,
    material: clone(material || materials[0]),
    materialId: (material || materials[0]).id,
    sessionId: createId('retelling'),
    recordingCount: 0,
    firstTranscript: '',
    firstRoundResult: null,
    firstRoundMaterialId: '',
    originalTrainingNeed: '',
    originalRetryScope: null,
    originalExpressionTarget: null,
    originalConceptTarget: null,
    firstEvaluation: null,
    secondTranscript: '',
    secondRoundResult: null,
    secondRoundMaterialId: '',
    progressResult: null,
    progressEvaluation: null,
    hint: '',
    hintAssist: '',
    retryTarget: '',
    errorMessage: ''
  };
}

let runtime = initialState();

function getState() {
  return clone(runtime);
}

function reset() {
  runtime = initialState();
  return getState();
}

function startNewSession(storage, random) {
  runtime = initialState(selectNextMaterial(materials, storage, random));
  return getState();
}

function restartCurrentMaterial() {
  runtime = initialState(runtime.material);
  return getState();
}

function beginFirstRecording() {
  if (runtime.phase !== PHASES.READING) return false;
  runtime.phase = PHASES.FIRST_RECORDING;
  runtime.recordingCount = 1;
  return true;
}

function beginSecondRecording() {
  if (runtime.phase !== PHASES.MICRO_HINT || runtime.recordingCount >= 2) return false;
  runtime.phase = PHASES.SECOND_RECORDING;
  runtime.recordingCount = 2;
  return true;
}

function startProcessing(round) {
  const expected = round === 1 ? PHASES.FIRST_RECORDING : PHASES.SECOND_RECORDING;
  if (runtime.phase !== expected) return false;
  runtime.phase = round === 1 ? PHASES.FIRST_PROCESSING : PHASES.SECOND_PROCESSING;
  return true;
}

function setFirstResult(transcript, firstRoundResult) {
  if (runtime.phase !== PHASES.FIRST_PROCESSING) return false;
  const routedResult = firstRoundResult && firstRoundResult.routedResult;
  const originalTrainingNeed = routedResult && routedResult.primaryTrainingNeed;
  if (!originalTrainingNeed
    || (originalTrainingNeed !== 'PASS' && !HINT_BY_NEED[originalTrainingNeed])) return false;
  runtime.firstTranscript = String(transcript || '');
  runtime.firstRoundResult = clone(firstRoundResult);
  runtime.firstRoundMaterialId = runtime.materialId;
  runtime.originalTrainingNeed = originalTrainingNeed;
  runtime.originalRetryScope = routedResult.retryScope || retryScopeForNeed(originalTrainingNeed);
  const processResult = firstRoundResult.processResult || {};
  runtime.originalExpressionTarget = ['WORDING_PRECISION', 'FORMULATION_BREAKDOWN'].includes(originalTrainingNeed)
    ? clone({
      issue: processResult.expressionIssue,
      userEvidence: processResult.userEvidence,
      materialEvidence: processResult.materialEvidence,
      relatedKeyPointIds: processResult.relatedKeyPointIds,
      reasonCode: processResult.reasonCode,
      confidence: processResult.confidence
    })
    : null;
  const concept = (firstRoundResult.routedResult && firstRoundResult.routedResult.conceptTarget)
    || (firstRoundResult.taskResult && firstRoundResult.taskResult.conceptInaccuracy);
  runtime.originalConceptTarget = originalTrainingNeed === 'CONCEPT_INACCURACY' && concept
    ? clone({
      userEvidence: concept.userEvidence,
      materialEvidence: concept.materialEvidence,
      relatedKeyPointIds: concept.relatedKeyPointIds,
      reasonCode: concept.reasonCode
    })
    : null;
  runtime.firstEvaluation = clone(routedResult);
  if (originalTrainingNeed === 'PASS') {
    runtime.phase = PHASES.RESULT;
    return true;
  }
  runtime.hint = HINT_BY_NEED[originalTrainingNeed]
    || HINT_BY_NEED.UNCERTAIN;
  runtime.hintAssist = HINT_ASSIST_BY_NEED[originalTrainingNeed]
    || HINT_ASSIST_BY_NEED.UNCERTAIN;
  runtime.phase = PHASES.MICRO_HINT;
  return true;
}

function setProgressResult(transcript, secondRoundResult, progressResult) {
  if (runtime.phase !== PHASES.SECOND_PROCESSING) return false;
  if (!secondRoundResult || !secondRoundResult.taskResult
    || !secondRoundResult.processResult || !secondRoundResult.routedResult
    || !progressResult
    || progressResult.originalTrainingNeed !== runtime.originalTrainingNeed) return false;
  runtime.secondTranscript = String(transcript || '');
  runtime.secondRoundResult = clone(secondRoundResult);
  runtime.secondRoundMaterialId = runtime.materialId;
  runtime.progressResult = clone(progressResult);
  runtime.progressEvaluation = clone(progressResult);
  runtime.phase = PHASES.RESULT;
  return true;
}

function fail(round, message) {
  runtime.retryTarget = round === 2 ? PHASES.SECOND_RECORDING : PHASES.FIRST_RECORDING;
  runtime.errorMessage = String(message || '这次没有完成，请重新录音。');
  runtime.phase = PHASES.ERROR;
}

function retry() {
  if (runtime.phase !== PHASES.ERROR || !runtime.retryTarget) return false;
  runtime.phase = runtime.retryTarget;
  runtime.errorMessage = '';
  return true;
}

module.exports = {
  PHASES,
  HINT_BY_NEED,
  HINT_ASSIST_BY_NEED,
  RETRY_SCOPES,
  retryScopeForNeed,
  getState,
  reset,
  startNewSession,
  restartCurrentMaterial,
  beginFirstRecording,
  beginSecondRecording,
  startProcessing,
  setFirstResult,
  setProgressResult,
  fail,
  retry
};
