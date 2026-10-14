'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const progressCases = require('../../../eval/retelling-dual-progress-cases');
const material = require('../../../eval/retelling-cases')[0].material;

const originalLoad = Module._load;
Module._load = function loadWithCloudMocks(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      downloadFile() { throw new Error('ASR_NOT_EXPECTED'); },
      deleteFile() { return Promise.resolve(); }
    };
  }
  if (request === './lib/asr' && parent && /analyzeSpeech[\\/]index\.js$/.test(parent.filename)) {
    return { recognizeSpeech() { throw new Error('ASR_NOT_EXPECTED'); } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const server = require('../index').__test;
Module._load = originalLoad;

function observation(roundResult) {
  return {
    taskResult: roundResult.taskResult,
    processResult: roundResult.processResult,
    routedResult: roundResult.routedResult,
    modelVersion: 'mock-dual',
    requestId: 'mock-request'
  };
}

function evaluationEvent(transcript = '第一次复述。') {
  return { material, transcript };
}

function progressEvent(item) {
  const firstRoundResult = Object.assign({}, item.firstRoundResult, {
    routedResult: Object.assign({}, item.firstRoundResult.routedResult, {
      primaryTrainingNeed: item.originalTrainingNeed
    })
  });
  return {
    material,
    first_round_result: firstRoundResult,
    original_training_need: item.originalTrainingNeed,
    second_transcript: item.secondRoundResult.transcript
  };
}

async function run() {
  const firstNeeds = [
    ['PASS', 'PASS'],
    ['MISSING_CAUSAL_STEP', 'MISSING_CORE_CONTENT'],
    ['INCORRECT_RELATION', 'INCORRECT_RELATION'],
    ['LEXICAL_RETRIEVAL', 'MISSING_CORE_CONTENT'],
    ['INFORMATION_ORDER', 'RELATION_NOT_ESTABLISHED']
  ];
  for (const [need, taskStatus] of firstNeeds) {
    let calls = 0;
    const result = await server.runRetellingEvaluation(evaluationEvent(), async () => {
      calls += 1;
      return {
        taskResult: { taskStatus },
        processResult: { processIssue: need === 'LEXICAL_RETRIEVAL' ? 'LEXICAL_RETRIEVAL' : 'NONE' },
        routedResult: { primaryTrainingNeed: need, recommendedAction: need === 'PASS' ? 'PASS' : 'FIXTURE' },
        modelVersion: 'mock-dual',
        requestId: 'first-request'
      };
    });
    assert.strictEqual(calls, 1, `${need} first round invokes Dual evaluator once`);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.firstRoundResult.routedResult.primaryTrainingNeed, need);
    assert.strictEqual(result.firstRoundResult.transcript, '第一次复述。');
  }

  const checks = [
    ['P01_missing_resolved', true],
    ['P02_missing_unresolved', false],
    ['P06_lexical_content_deleted', false],
    ['P08_order_still_disordered', false],
    ['P15_order_resolved_relation_not_established', true]
  ];
  for (const [id, expectedResolved] of checks) {
    const item = progressCases.find((candidate) => candidate.id === id);
    let calls = 0;
    const result = await server.runRetellingProgress(progressEvent(item), async (input) => {
      calls += 1;
      assert.strictEqual(input.transcript, item.secondRoundResult.transcript);
      assert.strictEqual(input.retryContext.trainingNeed, item.originalTrainingNeed);
      assert.ok(Object.prototype.hasOwnProperty.call(input.retryContext, 'targetMaterialEvidence'));
      assert.ok(!Object.prototype.hasOwnProperty.call(input.retryContext, 'originalExpressionTarget'));
      assert.ok(!Object.prototype.hasOwnProperty.call(input.retryContext, 'firstTranscript'));
      return observation(item.secondRoundResult);
    });
    assert.strictEqual(calls, 1, `${id} second round invokes Dual evaluator once`);
    assert.strictEqual(result.ok, true, `${id} progress response`);
    assert.strictEqual(result.progressResult.resolved, expectedResolved, `${id} resolved`);
    assert.strictEqual(result.progressResult.originalTrainingNeed, item.originalTrainingNeed, `${id} original target`);
    assert.strictEqual(
      result.secondRoundResult.routedResult.primaryTrainingNeed,
      item.secondRoundResult.routedResult.primaryTrainingNeed,
      `${id} preserves second observation`
    );
  }

  const p08 = progressCases.find((item) => item.id === 'P08_order_still_disordered');
  const p08Result = await server.runRetellingProgress(progressEvent(p08), async () => observation({
    transcript: p08.secondRoundResult.transcript,
    taskResult: Object.assign({}, p08.secondRoundResult.taskResult, {
      taskStatus: 'MISSING_CORE_CONTENT',
      coreFactsComplete: false
    }),
    processResult: Object.assign({}, p08.secondRoundResult.processResult, {
      processIssue: 'NONE',
      orderAnalysis: Object.assign({}, p08.secondRoundResult.processResult.orderAnalysis, { eligible: false })
    }),
    routedResult: Object.assign({}, p08.secondRoundResult.routedResult, {
      primaryTrainingNeed: 'MISSING_CAUSAL_STEP'
    })
  }));
  assert.strictEqual(p08Result.secondRoundResult.routedResult.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
  assert.strictEqual(p08Result.progressResult.originalTrainingNeed, 'INFORMATION_ORDER');
  assert.strictEqual(p08Result.progressResult.resolved, false);

  const p15 = progressCases.find((item) => item.id === 'P15_order_resolved_relation_not_established');
  const p15PassResult = await server.runRetellingProgress(progressEvent(p15), async () => observation({
    transcript: p15.secondRoundResult.transcript,
    taskResult: Object.assign({}, p15.secondRoundResult.taskResult, {
      taskStatus: 'PASS',
      coreFactsComplete: true
    }),
    processResult: Object.assign({}, p15.secondRoundResult.processResult, {
      processIssue: 'NONE',
      orderAnalysis: Object.assign({}, p15.secondRoundResult.processResult.orderAnalysis, { eligible: false })
    }),
    routedResult: Object.assign({}, p15.secondRoundResult.routedResult, {
      primaryTrainingNeed: 'PASS'
    })
  }));
  assert.strictEqual(p15PassResult.progressResult.originalTrainingNeed, 'INFORMATION_ORDER');
  assert.strictEqual(p15PassResult.progressResult.resolved, true);
  assert.strictEqual(p15PassResult.progressResult.reasonCode, 'ORDER_ISSUE_REMOVED');

  const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.js'), 'utf8');
  const legacyEvaluatorImport = 'require(' + "'./lib/retelling-evaluator'" + ')';
  const legacyProgressImport = 'require(' + "'./lib/retelling-progress-evaluator'" + ')';
  assert.ok(!source.includes(legacyEvaluatorImport));
  assert.ok(!source.includes(legacyProgressImport));
  assert.ok(!source.includes('evaluateRetellingProgress('));
  assert.ok(source.includes('evaluateRetellingDual'));
  assert.ok(source.includes('evaluateRetellingDualV057'));
  assert.ok(source.includes('resolveRetellingProgress'));

  console.log('retelling production migration tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
