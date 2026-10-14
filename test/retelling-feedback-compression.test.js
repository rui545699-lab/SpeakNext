'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const materials = require('../data/retelling-materials');
const store = require('../utils/retelling-store');
const { materialPayload } = require('../utils/retelling-service');
const {
  buildGroundedReference,
  buildMissingHintQuestion,
  buildResultReference
} = require('../utils/retelling-feedback-presenter');
const { buildFirstRoundDebugSummary } = require('../cloudfunctions/analyzeSpeech/lib/eval-debug-summary');

function material(id) {
  return materials.find((item) => item.id === id);
}

function target(id, fullEvidence) {
  return {
    userEvidence: { text: '用户问题片段', start: 0, end: 6 },
    materialEvidence: {
      text: fullEvidence,
      start: 0,
      end: fullEvidence.length,
      field: `key_points.${id}.text`
    },
    relatedKeyPointIds: [id],
    confidence: 'HIGH'
  };
}

// Concept: a long grounded evidence span is compressed using configured key-point feedback.
const conceptMaterial = material('retelling_001');
const longConceptEvidence = conceptMaterial.keyPoints.find((point) => point.id === 'K2').text;
const conceptTarget = target('K2', longConceptEvidence);
const conceptReference = buildGroundedReference({
  material: conceptMaterial,
  target: conceptTarget,
  trainingNeed: 'CONCEPT_INACCURACY'
});
assert.deepStrictEqual(conceptReference, {
  text: '辣椒素会激活与高温、灼热有关的感受器，让神经产生类似高温的信号。',
  keyPointId: 'K2',
  source: 'KEY_POINT_FEEDBACK_TEXT'
});
assert.ok(conceptReference.text.length < longConceptEvidence.length);

// Wording: the two calibrated cases use short, material-authored references.
const heatMaterial = material('retelling_002');
const heatReference = buildGroundedReference({
  material: heatMaterial,
  target: target('K2', heatMaterial.keyPoints.find((point) => point.id === 'K2').text),
  trainingNeed: 'WORDING_PRECISION'
});
assert.strictEqual(heatReference.text, '金属传递热量更快');
assert.strictEqual(heatReference.keyPointId, 'K2');

const voiceMaterial = material('retelling_003');
const voiceReference = buildGroundedReference({
  material: voiceMaterial,
  target: target('K3', voiceMaterial.keyPoints.find((point) => point.id === 'K3').text),
  trainingNeed: 'WORDING_PRECISION'
});
assert.strictEqual(voiceReference.text, '听到的声音成分不同');
assert.strictEqual(voiceReference.keyPointId, 'K3');

// Missing feedback identifies the grounded gap without copying the answer.
const microwaveMaterial = material('retelling_005');
const missingK2 = buildMissingHintQuestion({
  material: microwaveMaterial,
  taskResult: { missingCorePointIds: ['K2'] }
});
assert.deepStrictEqual(missingK2, {
  text: '为什么食物不同位置的加热速度会不一样？',
  targetId: 'K2',
  source: 'MATERIAL_MISSING_HINT_QUESTION'
});
assert.ok(!missingK2.text.includes(microwaveMaterial.keyPoints.find((point) => point.id === 'K2').text));
assert.strictEqual(buildMissingHintQuestion({
  material: microwaveMaterial,
  taskResult: { missingCorePointIds: ['K3'] }
}).targetId, 'K3');
assert.strictEqual(buildMissingHintQuestion({
  material: microwaveMaterial,
  taskResult: { missingCorePointIds: [] }
}).targetId, 'R2');

// PASS uses one material-authored result anchor; Concept resolved prefers its target key point.
const passReference = buildResultReference({
  material: material('retelling_004'),
  trainingNeed: 'PASS'
});
assert.strictEqual(passReference.text,
  '捏住鼻子后，气味信息难以到达嗅觉区域，因此整体风味会明显减弱。');
assert.strictEqual(passReference.source, 'MATERIAL_RESULT_REFERENCE');
const microwaveK1 = microwaveMaterial.keyPoints.find((point) => point.id === 'K1');
const conceptResultReference = buildResultReference({
  material: microwaveMaterial,
  trainingNeed: 'CONCEPT_INACCURACY',
  target: target('K1', microwaveK1.text)
});
assert.strictEqual(conceptResultReference.text,
  '食物中的水、脂肪、糖等成分会吸收微波能量并产生热量。');
assert.strictEqual(conceptResultReference.keyPointId, 'K1');

// Unsupported targets never receive answer-like material references.
assert.strictEqual(buildGroundedReference({
  material: conceptMaterial,
  target: conceptTarget,
  trainingNeed: 'MISSING_CAUSAL_STEP'
}), null);
assert.strictEqual(buildGroundedReference({
  material: conceptMaterial,
  target: conceptTarget,
  trainingNeed: 'FORMULATION_BREAKDOWN'
}), null);
assert.strictEqual(buildGroundedReference({
  material: conceptMaterial,
  target: Object.assign({}, conceptTarget, { relatedKeyPointIds: ['K99'] }),
  trainingNeed: 'CONCEPT_INACCURACY'
}), null);

// feedbackText remains local presentation metadata and is not sent to the evaluator.
const payload = materialPayload(conceptMaterial);
assert.ok(payload.key_points.every((point) => !Object.prototype.hasOwnProperty.call(point, 'feedback_text')));
assert.ok(payload.key_points.every((point) => !Object.prototype.hasOwnProperty.call(point, 'feedbackText')));

// Store and debug summaries retain the complete grounded materialEvidence unchanged.
store.startNewSession({
  getLast() { return ''; },
  setLast() {},
  getQueue() { return ['retelling_001']; },
  setQueue() {}
}, () => 0);
store.beginFirstRecording();
store.startProcessing(1);
const firstRoundResult = {
  transcript: '辣椒只是一种味觉。',
  taskResult: {
    taskStatus: 'CONCEPT_INACCURACY',
    keyPoints: [],
    relations: [],
    conceptInaccuracy: Object.assign({ detected: true, reasonCode: 'FIXTURE' }, conceptTarget)
  },
  processResult: { processIssue: 'NONE' },
  routedResult: {
    primaryTrainingNeed: 'CONCEPT_INACCURACY',
    recommendedAction: 'CORRECT_CONCEPT',
    conceptTarget,
    evidence: [{ text: '辣椒只是一种味觉' }]
  }
};
assert.strictEqual(store.setFirstResult(firstRoundResult.transcript, firstRoundResult), true);
const stored = store.getState();
assert.strictEqual(stored.originalConceptTarget.materialEvidence.text, longConceptEvidence);
const debug = buildFirstRoundDebugSummary({
  material: conceptMaterial,
  transcript: firstRoundResult.transcript,
  evaluation: firstRoundResult
});
assert.strictEqual(debug.conceptMaterialEvidence, longConceptEvidence);

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
const pagePath = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(pagePath)];
require(pagePath);
delete global.Page;
const page = Object.assign({}, pageDefinition, {
  data: JSON.parse(JSON.stringify(pageDefinition.data)),
  pageActive: true,
  exitRequested: false,
  setData(patch) { Object.assign(this.data, patch); }
});
page.sync();
assert.strictEqual(page.data.conceptReferenceText, conceptReference.text);
assert.strictEqual(page.data.conceptTarget.materialEvidence.text, longConceptEvidence);

store.reset();
store.beginFirstRecording();
store.startProcessing(1);
const missingRound = {
  transcript: '最后会觉得嘴里很灼热。',
  taskResult: {
    taskStatus: 'MISSING_CORE_CONTENT',
    missingCorePointIds: ['K2'],
    keyPoints: [],
    relations: [],
    incorrectClaims: []
  },
  processResult: { processIssue: 'NONE' },
  routedResult: {
    primaryTrainingNeed: 'MISSING_CAUSAL_STEP',
    recommendedAction: 'ADD_CAUSAL_LINK',
    evidence: []
  }
};
assert.strictEqual(store.setFirstResult(missingRound.transcript, missingRound), true);
page.sync();
assert.strictEqual(page.data.missingHintQuestion,
  conceptMaterial.missingHintQuestions.K2);

store.reset();
store.beginFirstRecording();
store.startProcessing(1);
const passRound = {
  transcript: '辣椒素让神经产生像高温一样的信号，所以嘴里会觉得灼热。',
  taskResult: { taskStatus: 'PASS', keyPoints: [], relations: [], incorrectClaims: [] },
  processResult: { processIssue: 'NONE' },
  routedResult: { primaryTrainingNeed: 'PASS', recommendedAction: 'PASS', evidence: [] }
};
assert.strictEqual(store.setFirstResult(passRound.transcript, passRound), true);
page.sync();
assert.strictEqual(page.data.resultReferenceText, conceptMaterial.resultReference);
assert.strictEqual(page.data.resultAssist,
  '这次主要意思已经表达清楚。不必为了说得更长继续补充。');

const template = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(template.includes('{{conceptReferenceText}}'));
assert.ok(template.includes('{{wordingReferenceText}}'));
assert.ok(template.includes('{{missingHintQuestion}}'));
assert.ok(template.includes('{{resultReferenceText}}'));
assert.ok(template.includes('你的两次表达'));
assert.ok(template.includes('你的表达'));
assert.ok(!template.includes('conceptTarget.materialEvidence.text'));
assert.ok(!template.includes('expressionTarget.materialEvidence.text'));

console.log('retelling grounded feedback compression tests passed');
