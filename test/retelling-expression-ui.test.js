'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../utils/retelling-store');
const { presentRetellingResult } = require('../utils/retelling-result-presenter');
const { buildResultReference } = require('../utils/retelling-feedback-presenter');

const template = fs.readFileSync(path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'), 'utf8');
const pageSource = fs.readFileSync(path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js'), 'utf8');
assert.ok(template.includes('你刚才说'));
assert.ok(template.includes('关键意思'));
assert.ok(!template.includes('原文这里是'));
assert.ok(!template.includes('conceptTarget.materialEvidence.text'));
assert.ok(!template.includes('expressionTarget.materialEvidence.text'));
assert.ok(template.includes('刚才这句'));
assert.ok(pageSource.includes('正在分析你的复述…'));
assert.ok(pageSource.includes('这个说法更准确了'));
assert.ok(pageSource.includes('这句话说完整了'));
assert.ok(pageSource.includes('这个意思还可以再说准一点'));
assert.ok(pageSource.includes('这句话还是断开了'));
assert.ok(pageSource.includes('这个意思说准确了'));
assert.ok(pageSource.includes('这个意思还没说准确'));
assert.ok(!template.includes('识别和评估都在当前页面完成。'));
assert.ok(!template.includes('==='));
assert.ok(!template.includes('!=='));
assert.ok(!template.includes('&amp;&amp;'));

assert.strictEqual(store.HINT_BY_NEED.WORDING_PRECISION, '这里可以说得更准确');
assert.strictEqual(store.HINT_ASSIST_BY_NEED.WORDING_PRECISION, '不用照搬原句，用自己的话把这个意思说准。');
assert.strictEqual(store.HINT_BY_NEED.FORMULATION_BREAKDOWN, '把这句话完整说出来');
assert.strictEqual(store.HINT_ASSIST_BY_NEED.FORMULATION_BREAKDOWN, '意思已经有了，这次把这一句连起来说完整。');
assert.strictEqual(store.HINT_BY_NEED.CONCEPT_INACCURACY, '这里的意思有一点偏');
assert.strictEqual(store.HINT_ASSIST_BY_NEED.CONCEPT_INACCURACY, '先不用照搬原句，把这个意思重新说准确。');

function point(id, evidence) {
  return {
    id,
    covered: true,
    evidence,
    start: 0,
    end: evidence.length
  };
}

function expressionRound(transcript, issue, evidence, id) {
  return {
    transcript,
    taskResult: {
      taskStatus: 'PASS',
      keyPoints: [point(id, transcript)],
      relations: [],
      incorrectClaims: []
    },
    processResult: {
      processIssue: 'NONE',
      expressionIssue: issue,
      reasonCode: 'FIXTURE',
      userEvidence: evidence ? { text: evidence, start: transcript.indexOf(evidence), end: transcript.indexOf(evidence) + evidence.length } : null,
      materialEvidence: issue === 'WORDING_PRECISION'
        ? { text: '负责感受高温和灼热刺激', start: 0, end: 12, field: 'key_points.K2' }
        : null,
      relatedKeyPointIds: issue === 'NONE' ? [] : [id],
      confidence: issue === 'NONE' ? 'LOW' : 'HIGH'
    },
    routedResult: {
      primaryTrainingNeed: issue === 'NONE' ? 'PASS' : issue,
      recommendedAction: issue === 'WORDING_PRECISION' ? 'REFINE_WORDING' : 'COMPLETE_FORMULATION',
      evidence: evidence ? [{ text: evidence }] : []
    }
  };
}

store.reset();
store.beginFirstRecording();
store.startProcessing(1);
const firstTranscript = '这个感受器是控制温度的。';
const first = expressionRound(firstTranscript, 'WORDING_PRECISION', '控制温度的', 'K2');
assert.strictEqual(store.setFirstResult(firstTranscript, first), true);
let state = store.getState();
assert.strictEqual(state.phase, store.PHASES.MICRO_HINT);
assert.strictEqual(state.originalTrainingNeed, 'WORDING_PRECISION');
assert.strictEqual(state.originalRetryScope, 'TARGET_EXPRESSION');
assert.strictEqual(state.originalExpressionTarget.userEvidence.text, '控制温度的');
assert.strictEqual(state.originalExpressionTarget.materialEvidence.text, '负责感受高温和灼热刺激');

store.beginSecondRecording();
store.startProcessing(2);
const secondTranscript = '这个感受器负责感受高温和灼热刺激。';
const second = expressionRound(secondTranscript, 'NONE', '', 'K2');
assert.strictEqual(store.setProgressResult(secondTranscript, second, {
  originalTrainingNeed: 'WORDING_PRECISION',
  resolved: true,
  improvementType: 'WORDING_REFINED',
  reasonCode: 'TARGET_WORDING_REFINED'
}), true);
state = store.getState();
assert.strictEqual(state.phase, store.PHASES.RESULT);

const presentation = presentRetellingResult({
  originalTrainingNeed: state.originalTrainingNeed,
  firstRoundResult: state.firstRoundResult,
  secondRoundResult: state.secondRoundResult,
  progressResult: state.progressResult,
  material: state.material
});
assert.strictEqual(presentation.title, '这个说法更准确了');
assert.strictEqual(presentation.beforeItems[0].text, '控制温度的');
assert.strictEqual(presentation.afterItems[0].text, secondTranscript);
assert.strictEqual(presentation.beforeItems[0].source, 'TRANSCRIPT');
assert.strictEqual(presentation.afterItems[0].source, 'TRANSCRIPT');

state = store.restartCurrentMaterial();
assert.strictEqual(state.originalExpressionTarget, null);
assert.strictEqual(state.originalConceptTarget, null);
assert.strictEqual(state.originalRetryScope, null);
assert.strictEqual(state.recordingCount, 0);

store.beginFirstRecording();
store.startProcessing(1);
const conceptTranscript = '这个感受器负责控制温度。';
const conceptTarget = {
  detected: true,
  userEvidence: { text: '控制温度', start: 8, end: 12 },
  materialEvidence: { text: '负责感受高温和灼热刺激', start: 0, end: 12, field: 'key_points.K2.text' },
  relatedKeyPointIds: ['K2'],
  reasonCode: 'FUNCTION_CHANGED',
  confidence: 'HIGH'
};
const conceptFirst = expressionRound(conceptTranscript, 'NONE', '', 'K2');
conceptFirst.taskResult.taskStatus = 'CONCEPT_INACCURACY';
conceptFirst.taskResult.conceptInaccuracy = conceptTarget;
conceptFirst.routedResult = {
  primaryTrainingNeed: 'CONCEPT_INACCURACY',
  recommendedAction: 'CORRECT_CONCEPT',
  conceptTarget,
  evidence: [{ text: '控制温度' }]
};
assert.strictEqual(store.setFirstResult(conceptTranscript, conceptFirst), true);
state = store.getState();
assert.strictEqual(state.originalConceptTarget.userEvidence.text, '控制温度');
assert.strictEqual(state.originalConceptTarget.materialEvidence.text, '负责感受高温和灼热刺激');
assert.strictEqual(state.originalRetryScope, 'FULL_CONTENT');
assert.strictEqual(store.beginSecondRecording(), true);
assert.strictEqual(store.startProcessing(2), true);
const correctedConceptTranscript = '这个感受器负责感受高温和灼热刺激。';
const conceptSecond = expressionRound(correctedConceptTranscript, 'NONE', '', 'K2');
conceptSecond.taskResult.conceptInaccuracy = { detected: false, relatedKeyPointIds: [] };
assert.strictEqual(store.setProgressResult(correctedConceptTranscript, conceptSecond, {
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  resolved: true,
  improvementType: 'CONCEPT_CORRECTED',
  reasonCode: 'CONCEPT_CORRECTED'
}), true);
state = store.getState();
const conceptPresentation = presentRetellingResult({
  originalTrainingNeed: state.originalTrainingNeed,
  firstRoundResult: state.firstRoundResult,
  secondRoundResult: state.secondRoundResult,
  progressResult: state.progressResult,
  material: state.material
});
assert.strictEqual(conceptPresentation.title, '这个意思说准确了');
assert.strictEqual(conceptPresentation.beforeItems[0].text, '控制温度');
assert.strictEqual(conceptPresentation.afterItems[0].text, correctedConceptTranscript);
assert.strictEqual(conceptPresentation.beforeItems[0].source, 'TRANSCRIPT');
assert.strictEqual(conceptPresentation.afterItems[0].source, 'TRANSCRIPT');
const conceptResultReference = buildResultReference({
  material: state.material,
  trainingNeed: state.originalTrainingNeed,
  target: state.originalConceptTarget
});
assert.ok(conceptPresentation.showChange);
assert.strictEqual(conceptResultReference.text,
  '辣椒素会激活与高温、灼热有关的感受器，让神经产生类似高温的信号。');

console.log('retelling expression UI tests passed');
