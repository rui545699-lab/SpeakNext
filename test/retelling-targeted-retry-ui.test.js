'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../utils/retelling-store');
const service = require('../utils/retelling-service');

function point(id, transcript, covered) {
  return {
    id,
    covered,
    evidence: covered ? transcript : '',
    start: covered ? 0 : -1,
    end: covered ? transcript.length : -1
  };
}

function round(transcript, issue, coveredIds, taskStatus) {
  const evidence = issue === 'FORMULATION_BREAKDOWN' ? '叫什么来着' : '处理热量';
  const start = transcript.indexOf(evidence);
  return {
    transcript,
    taskResult: {
      taskStatus: taskStatus || 'PASS',
      coreFactsComplete: coveredIds.includes('K2') && coveredIds.includes('K3'),
      keyPoints: ['K1', 'K2', 'K3', 'K4', 'K5']
        .map((id) => point(id, transcript, coveredIds.includes(id))),
      relations: [],
      incorrectClaims: [],
      conceptInaccuracy: { detected: false }
    },
    processResult: {
      processIssue: 'NONE',
      expressionIssue: issue,
      reasonCode: issue === 'FORMULATION_BREAKDOWN'
        ? 'WORD_SEARCH_INTERRUPTION'
        : issue === 'WORDING_PRECISION' ? 'IMPRECISE_MECHANISM_WORD' : 'EXPRESSION_NONE',
      confidence: issue === 'NONE' ? 'LOW' : 'HIGH',
      userEvidence: issue === 'NONE' ? null : {
        text: evidence, start, end: start + evidence.length
      },
      materialEvidence: issue === 'NONE' ? null : {
        text: '辣椒素会激活 TRPV1 感受器', start: 0, end: 17, field: 'key_points.K2'
      },
      relatedKeyPointIds: issue === 'NONE' ? [] : ['K2']
    },
    routedResult: {
      primaryTrainingNeed: issue === 'NONE' ? 'PASS' : issue,
      recommendedAction: issue === 'FORMULATION_BREAKDOWN'
        ? 'COMPLETE_FORMULATION'
        : issue === 'WORDING_PRECISION' ? 'REFINE_WORDING' : 'PASS',
      evidence: issue === 'NONE' ? [] : [{ text: evidence }]
      // Intentionally omit retryScope: this is the backward-compatibility fixture.
    }
  };
}

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
const pagePath = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(pagePath)];
require(pagePath);
delete global.Page;

function page() {
  return Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    pageActive: true,
    exitRequested: false,
    setData(patch) { Object.assign(this.data, patch); }
  });
}

const firstTranscript = '辣椒素会刺激一个叫什么来着，反正就是一种感受器。';
const first = round(firstTranscript, 'FORMULATION_BREAKDOWN', ['K2'], 'UNCERTAIN');
store.reset();
store.beginFirstRecording();
store.startProcessing(1);
assert.strictEqual(store.setFirstResult(firstTranscript, first), true);
let state = store.getState();
assert.strictEqual(state.originalRetryScope, 'TARGET_EXPRESSION');
assert.strictEqual(state.recordingCount, 1);

const instance = page();
instance.sync();
assert.strictEqual(instance.data.hintEyebrow, '只调整这一句');
assert.strictEqual(instance.data.hintTitle, '把这句话重新说完整');
assert.ok(instance.data.hintDescription.includes('不用重新说整篇'));
assert.strictEqual(instance.data.hintButtonText, '重新说这句话');
assert.strictEqual(instance.data.expressionCueText, '和高温、灼热刺激有关的感受器');

assert.strictEqual(store.beginSecondRecording(), true);
instance.sync();
assert.strictEqual(instance.data.secondRecordingEyebrow, '只重说这一句');
assert.strictEqual(instance.data.secondRecordingTitle, '把刚才这句话说清楚');
assert.ok(instance.data.secondRecordingHint.includes('不用重新说整篇'));
assert.strictEqual(store.getState().recordingCount, 2);

store.startProcessing(2);
const secondTranscript = '辣椒素会激活和高温、灼热刺激有关的感受器。';
const second = round(secondTranscript, 'NONE', [], 'UNCERTAIN');
second.processResult.targetRetryEvaluation = {
  applicable: true,
  targetRetained: true,
  targetEvidence: { text: secondTranscript, start: 0, end: secondTranscript.length },
  meaningChanged: false,
  reasonCode: 'TARGET_MEANING_RETAINED',
  relatedKeyPointIds: ['K2']
};
assert.strictEqual(store.setProgressResult(secondTranscript, second, {
  originalTrainingNeed: 'FORMULATION_BREAKDOWN',
  originalRetryScope: 'TARGET_EXPRESSION',
  resolved: true,
  improvementType: 'FORMULATION_COMPLETED',
  reasonCode: 'FORMULATION_COMPLETED',
  beforeEvidence: '叫什么来着',
  afterEvidence: secondTranscript
}), true);
instance.sync();
assert.strictEqual(instance.data.showTranscriptResult, false);
assert.strictEqual(instance.data.resultTitle, '这句话说完整了');
assert.strictEqual(instance.data.resultPresentation.showChange, true);
assert.strictEqual(instance.data.resultPresentation.beforeItems[0].text, '叫什么来着');
assert.strictEqual(instance.data.resultPresentation.afterItems[0].text, secondTranscript);
assert.strictEqual(instance.data.resultReferenceText, '和高温、灼热刺激有关的感受器');

store.reset();
store.beginFirstRecording();
store.startProcessing(1);
const wording = round('辣椒素处理热量的方式更快。', 'WORDING_PRECISION', ['K2'], 'PASS');
assert.strictEqual(store.setFirstResult(wording.transcript, wording), true);
instance.sync();
assert.strictEqual(instance.data.originalRetryScope, 'TARGET_EXPRESSION');
assert.strictEqual(instance.data.hintEyebrow, '只调整这一句');
assert.strictEqual(instance.data.hintTitle, '这句话可以说得更准确');
assert.ok(instance.data.hintDescription.includes('不用重新说整篇'));
assert.strictEqual(instance.data.hintButtonText, '重新说这句话');

// Full-content needs keep the existing retry UI.
store.reset();
store.beginFirstRecording();
store.startProcessing(1);
const missing = round('最后会觉得灼热。', 'NONE', ['K3'], 'MISSING_CORE_CONTENT');
missing.routedResult = {
  primaryTrainingNeed: 'MISSING_CAUSAL_STEP',
  recommendedAction: 'ADD_CAUSAL_LINK',
  retryScope: 'FULL_CONTENT',
  evidence: []
};
assert.strictEqual(store.setFirstResult(missing.transcript, missing), true);
instance.sync();
assert.strictEqual(instance.data.originalRetryScope, 'FULL_CONTENT');
assert.strictEqual(instance.data.hintButtonText, '再完整说一次');
assert.ok(!instance.data.hintDescription.includes('不用重新说整篇'));

const template = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(template.includes('{{expressionCueText}}'));
assert.ok(template.includes('secondRecordingEyebrow'));
assert.ok(template.includes('{{showTranscriptResult}}'));

// The client sends one progress cloud invocation carrying the frozen target and scope.
(async () => {
  let calls = 0;
  let payload;
  global.wx = {
    cloud: {
      callFunction(options) {
        calls += 1;
        payload = options.data;
        return Promise.resolve({
          result: {
            ok: true,
            secondRoundResult: second,
            progressResult: { originalTrainingNeed: 'FORMULATION_BREAKDOWN', resolved: true }
          }
        });
      }
    }
  };
  await service.callRetellingProgress(
    state.material,
    first,
    'FORMULATION_BREAKDOWN',
    secondTranscript,
    'TARGET_EXPRESSION',
    null,
    state.originalExpressionTarget
  );
  assert.strictEqual(calls, 1);
  assert.strictEqual(payload.original_retry_scope, 'TARGET_EXPRESSION');
  assert.strictEqual(payload.original_expression_target.relatedKeyPointIds[0], 'K2');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'transcript'));
  delete global.wx;
  console.log('retelling targeted retry UI tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
