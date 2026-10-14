'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../utils/retelling-store');

function dualRound(transcript, need, options = {}) {
  return {
    transcript,
    taskResult: Object.assign({ taskStatus: need === 'PASS' ? 'PASS' : 'MISSING_CORE_CONTENT' }, options.taskResult),
    processResult: Object.assign({ processIssue: 'NONE' }, options.processResult),
    routedResult: Object.assign({
      primaryTrainingNeed: need,
      recommendedAction: need === 'PASS' ? 'PASS' : 'FIXTURE_ACTION',
      evidence: options.evidence || []
    }, options.routedResult)
  };
}

function enterFirstProcessing() {
  store.reset();
  assert.strictEqual(store.beginFirstRecording(), true);
  assert.strictEqual(store.startProcessing(1), true);
}

const trainingNeeds = [
  'MISSING_CAUSAL_STEP',
  'INCORRECT_RELATION',
  'LEXICAL_RETRIEVAL',
  'INFORMATION_ORDER',
  'UNCERTAIN'
];

trainingNeeds.forEach((need) => {
  enterFirstProcessing();
  const first = dualRound('第一次复述。', need);
  assert.strictEqual(store.setFirstResult(first.transcript, first), true, `${need} first result`);
  const state = store.getState();
  assert.strictEqual(state.phase, store.PHASES.MICRO_HINT, `${need} enters hint`);
  assert.strictEqual(state.originalTrainingNeed, need);
  assert.deepStrictEqual(state.firstRoundResult, first);
  assert.ok(state.hint);
});

enterFirstProcessing();
const passRound = dualRound('核心意思已经表达清楚。', 'PASS');
assert.strictEqual(store.setFirstResult(passRound.transcript, passRound), true);
let state = store.getState();
assert.strictEqual(state.phase, store.PHASES.RESULT);
assert.strictEqual(state.recordingCount, 1);
assert.strictEqual(state.originalTrainingNeed, 'PASS');
assert.strictEqual(store.beginSecondRecording(), false);

enterFirstProcessing();
const orderFirst = dualRound('第一次顺序较乱。', 'INFORMATION_ORDER');
store.setFirstResult(orderFirst.transcript, orderFirst);
assert.strictEqual(store.beginSecondRecording(), true);
assert.strictEqual(store.startProcessing(2), true);
const secondRound = dualRound('第二次内容。', 'MISSING_CAUSAL_STEP');
assert.strictEqual(store.setProgressResult(secondRound.transcript, secondRound, {
  originalTrainingNeed: 'MISSING_CAUSAL_STEP',
  resolved: false,
  improvementType: null,
  reasonCode: 'CORE_CONTENT_STILL_MISSING'
}), false, 'second routed need cannot replace original target');
assert.strictEqual(store.setProgressResult(secondRound.transcript, secondRound, {
  originalTrainingNeed: 'INFORMATION_ORDER',
  resolved: false,
  improvementType: null,
  reasonCode: 'CONTENT_DEGRADED_AFTER_REORDER'
}), true);
state = store.getState();
assert.strictEqual(state.phase, store.PHASES.RESULT);
assert.strictEqual(state.recordingCount, 2);
assert.strictEqual(state.originalTrainingNeed, 'INFORMATION_ORDER');
assert.strictEqual(state.secondRoundResult.routedResult.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(state.progressResult.originalTrainingNeed, 'INFORMATION_ORDER');
assert.strictEqual(store.beginSecondRecording(), false);

const retellingTemplate = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(retellingTemplate.includes('{{resultTitle}}'));
assert.ok(retellingTemplate.includes('label="再练一次"'));

const previousSessionId = state.sessionId;
const previousMaterialId = state.material.id;
state = store.restartCurrentMaterial();
assert.strictEqual(state.phase, store.PHASES.READING);
assert.strictEqual(state.recordingCount, 0);
assert.strictEqual(state.material.id, previousMaterialId);
assert.notStrictEqual(state.sessionId, previousSessionId);
assert.strictEqual(state.firstTranscript, '');
assert.strictEqual(state.firstRoundResult, null);
assert.strictEqual(state.originalTrainingNeed, '');
assert.strictEqual(state.secondTranscript, '');
assert.strictEqual(state.secondRoundResult, null);
assert.strictEqual(state.progressResult, null);
assert.strictEqual(store.beginFirstRecording(), true);
assert.strictEqual(store.getState().recordingCount, 1);

const calls = [];
global.wx = {
  cloud: {
    uploadFile({ cloudPath, filePath }) {
      calls.push({ type: 'upload', cloudPath, filePath });
      return Promise.resolve({ fileID: 'cloud://retelling/first.mp3' });
    },
    callFunction({ data }) {
      calls.push({ type: 'function', mode: data.mode, data });
      if (data.mode === 'asr_test') {
        return Promise.resolve({ result: {
          ok: true,
          stage: 'ASR',
          transcript: '通知多会让人习惯忽略，所以重要消息也会漏。',
          wordList: [],
          audioDuration: 2200
        } });
      }
      if (data.mode === 'retelling_evaluation') {
        const firstRoundResult = dualRound(data.transcript, 'PASS');
        return Promise.resolve({ result: {
          ok: true,
          stage: 'RETELLING_EVALUATION',
          firstRoundResult
        } });
      }
      if (data.mode === 'retelling_progress') {
        const liveSecond = dualRound(data.second_transcript, 'PASS');
        return Promise.resolve({ result: {
          ok: true,
          stage: 'PROGRESS_EVALUATION',
          secondRoundResult: liveSecond,
          progressResult: {
            originalTrainingNeed: data.original_training_need,
            resolved: true,
            improvementType: 'CAUSAL_LINK_ADDED',
            reasonCode: 'CORE_CHAIN_COMPLETED'
          }
        } });
      }
      return Promise.reject(new Error('UNEXPECTED_MODE'));
    }
  }
};

const service = require('../utils/retelling-service');
const serviceFirst = dualRound('第一次内容。', 'MISSING_CAUSAL_STEP');

service.transcribeRetellingRecording({
  recorded: true,
  tempFilePath: 'wxfile://retelling.mp3',
  durationMs: 2200,
  fileSize: 7000
}, 'retelling_session', 1)
  .then((asr) => service.callRetellingEvaluation(state.material, asr.transcript))
  .then((result) => {
    assert.strictEqual(result.firstRoundResult.routedResult.primaryTrainingNeed, 'PASS');
    return service.callRetellingProgress(
      state.material,
      serviceFirst,
      'MISSING_CAUSAL_STEP',
      '第二次完整复述。'
    );
  })
  .then((result) => {
    assert.strictEqual(result.progressResult.originalTrainingNeed, 'MISSING_CAUSAL_STEP');
    const progressCall = calls.find((item) => item.mode === 'retelling_progress');
    assert.strictEqual(progressCall.data.first_round_result, serviceFirst);
    assert.strictEqual(progressCall.data.original_training_need, 'MISSING_CAUSAL_STEP');
    assert.ok(!Object.prototype.hasOwnProperty.call(progressCall.data, 'first_evaluation'));
    assert.deepStrictEqual(calls.map((item) => item.type === 'function' ? item.mode : item.type), [
      'upload',
      'asr_test',
      'retelling_evaluation',
      'retelling_progress'
    ]);
    console.log('retelling flow tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
