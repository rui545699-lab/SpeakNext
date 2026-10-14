'use strict';

const assert = require('assert');
const Module = require('module');
const {
  buildFirstRoundDebugSummary,
  buildSecondRoundDebugSummary
} = require('../lib/eval-debug-summary');

const material = {
  id: 'retelling_005',
  title: '测试材料',
  core_message: '测试核心意思',
  key_points: ['K1', 'K2', 'K3', 'K4', 'K5'].map((id) => ({ id, role: ['K2', 'K3'].includes(id) ? 'CORE' : 'SUPPORTING', text: id })),
  relations: [
    { id: 'R1', from: 'K1', to: 'K2', type: 'CAUSE' },
    { id: 'R2', from: 'K2', to: 'K3', type: 'CAUSE' }
  ]
};

function task(taskStatus, covered, relationStatus = 'MISSING') {
  return {
    taskStatus,
    coreMeaningClear: taskStatus === 'PASS',
    coreFactsComplete: taskStatus === 'PASS',
    missingCorePointIds: taskStatus === 'PASS' ? [] : ['K2'],
    keyPoints: ['K1', 'K2', 'K3', 'K4', 'K5'].map((id) => ({
      id,
      covered: covered.includes(id),
      evidence: covered.includes(id) ? `${id} evidence` : '',
      start: covered.includes(id) ? 0 : -1,
      end: covered.includes(id) ? 2 : -1
    })),
    relations: [
      { id: 'R1', status: 'MISSING' },
      { id: 'R2', status: relationStatus }
    ],
    incorrectClaims: [],
    conceptInaccuracy: {
      detected: taskStatus === 'CONCEPT_INACCURACY',
      userEvidence: null,
      materialEvidence: null,
      relatedKeyPointIds: [],
      reasonCode: taskStatus === 'CONCEPT_INACCURACY' ? 'FIXTURE_CONCEPT' : 'CONCEPT_NONE',
      confidence: taskStatus === 'CONCEPT_INACCURACY' ? 'HIGH' : 'LOW'
    },
    requiresNewContent: taskStatus === 'MISSING_CORE_CONTENT'
  };
}

function evaluation(taskResult, processIssue, need, requestId = 'request-summary') {
  return {
    taskResult,
    processResult: {
      processIssue,
      orderAnalysis: { observedOrder: taskResult.keyPoints.filter((item) => item.covered).map((item) => item.id) }
    },
    routedResult: { primaryTrainingNeed: need, recommendedAction: need === 'PASS' ? 'PASS' : 'ADD_CAUSAL_LINK' },
    modelVersion: 'mock-dual',
    requestId
  };
}

function assertSafeSummary(summary) {
  const serialized = JSON.stringify(summary).toLowerCase();
  ['audio', 'wordlist', 'apikey', 'api_key', 'secret', 'authorization'].forEach((name) => {
    assert.strictEqual(serialized.includes(name), false, `summary must not contain ${name}`);
  });
}

const missingEvaluation = evaluation(task('MISSING_CORE_CONTENT', ['K3']), 'NONE', 'MISSING_CAUSAL_STEP');
const missingSnapshot = JSON.stringify(missingEvaluation);
const first = buildFirstRoundDebugSummary({
  material,
  transcript: '有些地方热，有些地方冷。',
  evaluation: missingEvaluation
});
assert.strictEqual(first.stage, 'FIRST_ROUND');
assert.strictEqual(first.materialId, 'retelling_005');
assert.strictEqual(first.transcript, '有些地方热，有些地方冷。');
assert.strictEqual(first.taskStatus, 'MISSING_CORE_CONTENT');
assert.deepStrictEqual(first.keyPoints, { K1: false, K2: false, K3: true, K4: false, K5: false });
assert.deepStrictEqual(first.relations, { R1: 'MISSING', R2: 'MISSING' });
assert.deepStrictEqual(first.observedOrder, ['K3']);
assert.strictEqual(first.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(first.expressionIssue, 'NONE');
assert.deepStrictEqual(first.expressionRelatedKeyPointIds, []);
assert.strictEqual(first.conceptInaccuracyDetected, false);
assert.strictEqual(first.conceptReasonCode, 'CONCEPT_NONE');
assert.strictEqual(JSON.stringify(missingEvaluation), missingSnapshot, 'first helper must not mutate result');
assertSafeSummary(first);

const passEvaluation = evaluation(task('PASS', ['K2', 'K3'], 'CORRECT'), 'NONE', 'PASS', 'request-pass');
const pass = buildFirstRoundDebugSummary({ material, transcript: '完整表达。', evaluation: passEvaluation });
assert.strictEqual(pass.coreMeaningClear, true);
assert.strictEqual(pass.primaryTrainingNeed, 'PASS');

const uncertainEvaluation = evaluation(task('UNCERTAIN', []), 'NONE', 'UNCERTAIN', 'request-uncertain');
const uncertain = buildFirstRoundDebugSummary({ material, transcript: '没看懂。', evaluation: uncertainEvaluation });
assert.strictEqual(uncertain.taskStatus, 'UNCERTAIN');
assert.strictEqual(uncertain.primaryTrainingNeed, 'UNCERTAIN');

const progress = {
  originalTrainingNeed: 'MISSING_CAUSAL_STEP',
  resolved: true,
  improvementType: 'CAUSAL_LINK_ADDED',
  reasonCode: 'CORE_CHAIN_COMPLETED',
  coreMeaningClearAfter: true,
  beforeEvidence: '第一次证据',
  afterEvidence: '第二次证据'
};
const secondSnapshot = JSON.stringify(passEvaluation);
const progressSnapshot = JSON.stringify(progress);
const second = buildSecondRoundDebugSummary({
  material,
  transcript: '第二次完整表达。',
  evaluation: passEvaluation,
  progressResult: progress
});
assert.strictEqual(second.stage, 'SECOND_ROUND');
assert.strictEqual(second.secondTaskStatus, 'PASS');
assert.strictEqual(second.secondProcessIssue, 'NONE');
assert.strictEqual(second.secondPrimaryTrainingNeed, 'PASS');
assert.strictEqual(second.originalTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(second.resolved, true);
assert.strictEqual(second.reasonCode, 'CORE_CHAIN_COMPLETED');
assert.strictEqual(second.coreMeaningClearAfter, true);
assert.strictEqual(second.expressionIssue, 'NONE');
assert.strictEqual(second.targetRetryApplicable, false);
assert.strictEqual(second.targetRetained, null);
assert.strictEqual(JSON.stringify(passEvaluation), secondSnapshot, 'second helper must not mutate evaluation');
assert.strictEqual(JSON.stringify(progress), progressSnapshot, 'second helper must not mutate progress');
assertSafeSummary(second);

const targetTranscript = '录音和平时听到的声音成分不一样。';
const targetedEvaluation = evaluation(task('UNCERTAIN', []), 'NONE', 'PASS', 'request-target');
targetedEvaluation.processResult.targetRetryEvaluation = {
  applicable: true,
  targetRetained: true,
  targetEvidence: { text: targetTranscript, start: 0, end: targetTranscript.length },
  meaningChanged: false,
  reasonCode: 'TARGET_MEANING_RETAINED'
};
const targetedSummary = buildSecondRoundDebugSummary({
  material,
  transcript: targetTranscript,
  evaluation: targetedEvaluation,
  progressResult: Object.assign({}, progress, {
    originalTrainingNeed: 'WORDING_PRECISION',
    improvementType: 'WORDING_REFINED',
    reasonCode: 'WORDING_REFINED',
    coreMeaningClearAfter: false
  })
});
assert.strictEqual(targetedSummary.targetRetryApplicable, true);
assert.strictEqual(targetedSummary.targetRetained, true);
assert.strictEqual(targetedSummary.targetEvidence, targetTranscript);
assert.strictEqual(targetedSummary.targetMeaningChanged, false);
assert.strictEqual(targetedSummary.targetRetryReasonCode, 'TARGET_MEANING_RETAINED');
assertSafeSummary(targetedSummary);

const originalLoad = Module._load;
Module._load = function loadWithCloudMocks(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return { DYNAMIC_CURRENT_ENV: 'test', init() {} };
  }
  if (request === './lib/asr' && parent && /analyzeSpeech[\\/]index\.js$/.test(parent.filename)) {
    return { recognizeSpeech() { throw new Error('ASR_NOT_EXPECTED'); } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const server = require('../index').__test;
Module._load = originalLoad;

async function captureSummary(run) {
  const originalLog = console.log;
  const calls = [];
  console.log = (...args) => calls.push(args);
  try {
    const response = await run();
    const summaries = calls.filter((args) => args[0] === '[SPEAKNEXT_EVAL]');
    assert.strictEqual(summaries.length, 1, 'successful evaluation must log exactly one summary');
    assert.strictEqual(typeof summaries[0][1], 'string');
    return { response, summary: JSON.parse(summaries[0][1]) };
  } finally {
    console.log = originalLog;
  }
}

async function run() {
  const firstLog = await captureSummary(() => server.runRetellingEvaluation({
    material,
    transcript: '有些地方热，有些地方冷。'
  }, async () => missingEvaluation));
  assert.strictEqual(firstLog.response.ok, true);
  assert.deepStrictEqual(firstLog.summary, first);

  const firstRoundResult = {
    transcript: '有些地方热，有些地方冷。',
    taskResult: missingEvaluation.taskResult,
    processResult: missingEvaluation.processResult,
    routedResult: missingEvaluation.routedResult
  };
  const secondLog = await captureSummary(() => server.runRetellingProgress({
    material,
    first_round_result: firstRoundResult,
    original_training_need: 'MISSING_CAUSAL_STEP',
    second_transcript: '第二次完整表达。'
  }, async () => passEvaluation, () => progress));
  assert.strictEqual(secondLog.response.ok, true);
  assert.deepStrictEqual(secondLog.summary, second);

  console.log('eval debug summary tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
