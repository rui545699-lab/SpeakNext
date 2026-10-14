'use strict';

const assert = require('assert');
const version = require('../config/product-version');
const materials = require('../data/retelling-materials');
const retellingStore = require('../utils/retelling-store');
const trainingStore = require('../utils/training-store');
const {
  RETRY_SCOPES,
  routeRetellingTrainingV057
} = require('../cloudfunctions/analyzeSpeech/lib/retelling-training-router');
const {
  resolveRetellingProgress
} = require('../cloudfunctions/analyzeSpeech/lib/retelling-progress-resolver');
const {
  EVENT_NAMES
} = require('../cloudfunctions/trackRetellingEvent/validation');

assert.deepStrictEqual(version.informationReconstruction, {
  version: 'v0.5.10.3',
  status: 'STABLE_BASELINE',
  reopenedFrom: 'v0.5.9b.2',
  change: 'UNCERTAIN_PROGRESS_SEMANTICS'
});
assert.deepStrictEqual(materials.map((item) => item.id), [
  'retelling_001',
  'retelling_002',
  'retelling_003',
  'retelling_004',
  'retelling_005',
  'retelling_006'
]);

function task(taskStatus, conceptDetected = false) {
  return {
    taskStatus,
    relations: [],
    incorrectClaims: [],
    conceptInaccuracy: {
      detected: conceptDetected,
      userEvidence: conceptDetected ? { text: '错误概念', start: 0, end: 4 } : null,
      relatedKeyPointIds: conceptDetected ? ['K2'] : []
    }
  };
}

function process(expressionIssue = 'NONE', legacyProcessIssue = 'NONE') {
  const active = expressionIssue !== 'NONE';
  return {
    processIssue: legacyProcessIssue,
    expressionIssue,
    reasonCode: expressionIssue === 'FORMULATION_BREAKDOWN'
      ? 'WORD_SEARCH_INTERRUPTION'
      : active ? 'VAGUE_REFERENCE' : 'EXPRESSION_NONE',
    confidence: active ? 'HIGH' : 'LOW',
    userEvidence: active ? { text: '目标表达', start: 0, end: 4 } : null,
    materialEvidence: active
      ? { text: '材料目标', start: 0, end: 4, field: 'key_points.K2' }
      : null,
    relatedKeyPointIds: active ? ['K2'] : [],
    evidence: []
  };
}

// V0.5.10.1 preserves the frozen production routing and does not restore legacy categories.
assert.strictEqual(
  routeRetellingTrainingV057(task('PASS'), process('NONE', 'INFORMATION_ORDER')).primaryTrainingNeed,
  'PASS'
);
assert.strictEqual(
  routeRetellingTrainingV057(task('PASS'), process('NONE', 'LEXICAL_RETRIEVAL')).primaryTrainingNeed,
  'PASS'
);

const wording = routeRetellingTrainingV057(task('PASS'), process('WORDING_PRECISION'));
assert.strictEqual(wording.primaryTrainingNeed, 'WORDING_PRECISION');
assert.strictEqual(wording.retryScope, RETRY_SCOPES.TARGET_EXPRESSION);

const formulation = routeRetellingTrainingV057(task('PASS'), process('FORMULATION_BREAKDOWN'));
assert.strictEqual(formulation.primaryTrainingNeed, 'FORMULATION_BREAKDOWN');
assert.strictEqual(formulation.retryScope, RETRY_SCOPES.TARGET_EXPRESSION);

const concept = routeRetellingTrainingV057(task('CONCEPT_INACCURACY', true), process());
assert.strictEqual(concept.primaryTrainingNeed, 'CONCEPT_INACCURACY');
assert.strictEqual(concept.retryScope, RETRY_SCOPES.FULL_CONTENT);

const missing = routeRetellingTrainingV057(task('MISSING_CORE_CONTENT'), process());
assert.strictEqual(missing.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(missing.retryScope, RETRY_SCOPES.FULL_CONTENT);

const uncertain = routeRetellingTrainingV057(task('UNCERTAIN'), process());
assert.strictEqual(uncertain.primaryTrainingNeed, 'UNCERTAIN');
assert.strictEqual(uncertain.retryScope, RETRY_SCOPES.FULL_CONTENT);

const pass = routeRetellingTrainingV057(task('PASS'), process());
assert.strictEqual(pass.primaryTrainingNeed, 'PASS');
assert.strictEqual(pass.retryScope, null);

// A session cannot start a third recording.
retellingStore.reset();
assert.strictEqual(retellingStore.beginFirstRecording(), true);
assert.strictEqual(retellingStore.startProcessing(1), true);
assert.strictEqual(retellingStore.setFirstResult('第一次表达', {
  taskResult: task('PASS'),
  processResult: process('WORDING_PRECISION'),
  routedResult: wording
}), true);
assert.strictEqual(retellingStore.beginSecondRecording(), true);
assert.strictEqual(retellingStore.beginSecondRecording(), false);
assert.strictEqual(retellingStore.getState().recordingCount, 2);

// A completed session is counted exactly once.
const storage = new Map();
global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); }
};
let completion = trainingStore.completePracticeSession('freeze-session');
assert.deepStrictEqual(completion, { ok: true, added: true, count: 1 });
completion = trainingStore.completePracticeSession('freeze-session');
assert.deepStrictEqual(completion, { ok: true, added: false, count: 1 });
delete global.wx;

assert.deepStrictEqual(Array.from(EVENT_NAMES).sort(), [
  'RETELLING_FIRST_EVALUATION_COMPLETED',
  'RETELLING_FIRST_RECORDING_COMPLETED',
  'RETELLING_INTERVENTION_SHOWN',
  'RETELLING_PROGRESS_COMPLETED',
  'RETELLING_READING_COMPLETED',
  'RETELLING_RETRY_STARTED',
  'RETELLING_ROUND_COMPLETED',
  'RETELLING_SECOND_RECORDING_COMPLETED',
  'RETELLING_SESSION_STARTED'
].sort());

// Deleting the original target remains unresolved even when the second task is partial.
const deletedTranscript = '所以最后只说了相邻结论。';
const deletionResult = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: {
    relatedKeyPointIds: ['K3'],
    userEvidence: { text: '原表达', start: 0, end: 3 }
  },
  firstRoundResult: {
    transcript: '原表达',
    taskResult: { keyPoints: [], relations: [], incorrectClaims: [], conceptInaccuracy: { detected: false } },
    processResult: process('WORDING_PRECISION'),
    routedResult: wording
  },
  secondRoundResult: {
    transcript: deletedTranscript,
    taskResult: {
      taskStatus: 'UNCERTAIN',
      keyPoints: [],
      relations: [],
      incorrectClaims: [],
      conceptInaccuracy: { detected: false }
    },
    processResult: Object.assign(process(), {
      targetRetryEvaluation: {
        applicable: true,
        targetRetained: false,
        targetEvidence: { text: deletedTranscript, start: 0, end: deletedTranscript.length },
        meaningChanged: false,
        reasonCode: 'TARGET_DELETED'
      }
    }),
    routedResult: pass
  }
});
assert.strictEqual(deletionResult.resolved, false);
assert.strictEqual(deletionResult.reasonCode, 'TARGET_CONTENT_REMOVED');

console.log('information reconstruction freeze contract tests passed (12 guards)');
