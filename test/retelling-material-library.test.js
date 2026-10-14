'use strict';

const assert = require('assert');
const materials = require('../data/retelling-materials');
const { validateMaterialBank } = require('../data/retelling-material-validator');
const { selectNextMaterial } = require('../utils/retelling-material-selector');
const store = require('../utils/retelling-store');
const { materialPayload } = require('../utils/retelling-service');
const { getMaterialCoreChain, presentRetellingResult } = require('../utils/retelling-result-presenter');
const { validateRetellingEvaluationEvent } = require('../cloudfunctions/analyzeSpeech/lib/validation');
const legacyNotificationMaterial = require('../eval/fixtures/retelling-001-notification-legacy');
const legacyRetellingCases = require('../eval/retelling-cases');

assert.strictEqual(materials.length, 6);
assert.strictEqual(validateMaterialBank(materials), true);
assert.deepStrictEqual(materials.map((item) => item.id), [
  'retelling_001',
  'retelling_002',
  'retelling_003',
  'retelling_004',
  'retelling_005',
  'retelling_006'
]);
assert.strictEqual(new Set(materials.map((item) => item.id)).size, 6);

const materialExpectations = {
  retelling_001: ['辣椒明明没那么烫，嘴里为什么像着火？', '激活高温感受器', '产生灼热感觉'],
  retelling_002: ['金属和木头放在同一个房间，为什么金属摸起来更冷？', '金属带走热量更快', '皮肤降温更快'],
  retelling_003: ['为什么录音里的自己，总听起来有点陌生？', '两种听声方式不同', '录音听起来更陌生'],
  retelling_004: ['捏住鼻子吃东西，为什么味道一下少了很多？', '嗅觉信息减少', '食物变得没那么有味道'],
  retelling_005: ['微波炉加热同一盒饭，为什么总是一块烫、一块冷？', '各处加热速度不同', '形成冷热不均'],
  retelling_006: ['刚下小雨时，空气里的“土味”是从哪来的？', '气溶胶带出气味物质', '闻到雨后的泥土味']
};

Object.entries(materialExpectations).forEach(([id, expected]) => {
  const item = materials.find((entry) => entry.id === id);
  assert.strictEqual(item.title, expected[0]);
  assert.strictEqual(item.keyPoints.find((point) => point.id === 'K2').displayText, expected[1]);
  assert.strictEqual(item.keyPoints.find((point) => point.id === 'K3').displayText, expected[2]);
});

const productionMaterialText = JSON.stringify(materials);
['通知很多', '购物车', '会议记录', '计划排满'].forEach((legacyText) => {
  assert.ok(!productionMaterialText.includes(legacyText), `production materials must remove ${legacyText}`);
});
assert.strictEqual(legacyNotificationMaterial.title, '为什么通知越多，反而越容易漏掉重要消息？');
assert.strictEqual(legacyNotificationMaterial.keyPoints[1].displayText, '逐渐习惯忽略提醒');
assert.strictEqual(legacyRetellingCases[0].material.title, legacyNotificationMaterial.title,
  'historical deterministic eval must use the legacy notification fixture');
assert.notStrictEqual(materials[0].title, legacyNotificationMaterial.title,
  'production retelling_001 must be independent from the historical fixture');

materials.forEach((item) => {
  const k2 = item.keyPoints.find((point) => point.id === 'K2');
  const k3 = item.keyPoints.find((point) => point.id === 'K3');
  assert.ok(k2.expressionCue && k2.expressionCue.trim(), `${item.id} K2 expressionCue`);
  assert.ok(k3.expressionCue && k3.expressionCue.trim(), `${item.id} K3 expressionCue`);
  const r2 = item.relations.find((relation) => relation.id === 'R2');
  assert.strictEqual(k2.role, 'CORE', `${item.id} K2`);
  assert.strictEqual(k3.role, 'CORE', `${item.id} K3`);
  assert.strictEqual(r2.from, 'K2', `${item.id} R2.from`);
  assert.strictEqual(r2.to, 'K3', `${item.id} R2.to`);
  assert.strictEqual(r2.type, 'CAUSE', `${item.id} R2.type`);
  assert.ok(item.resultReference && item.resultReference.length > 0, `${item.id} resultReference`);
  assert.deepStrictEqual(Object.keys(item.missingHintQuestions).sort(), ['K2', 'K3', 'R2']);
  Object.values(item.missingHintQuestions).forEach((question) => {
    assert.ok(question.endsWith('？'), `${item.id} missing hint must be a question`);
    assert.ok(!item.keyPoints.some((point) => point.text === question),
      `${item.id} missing hint must not copy a full answer`);
  });
  const payload = materialPayload(item);
  assert.ok(payload.key_points.every((point) => !Object.prototype.hasOwnProperty.call(point, 'displayText')));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'resultReference'));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'missingHintQuestions'));
  assert.ok(payload.key_points.every((point) => !Object.prototype.hasOwnProperty.call(point, 'feedbackText')));
  assert.ok(payload.key_points.every((point) => !Object.prototype.hasOwnProperty.call(point, 'expressionCue')));
  ['K2', 'K3'].forEach((id) => {
    const sourcePoint = item.keyPoints.find((point) => point.id === id);
    const payloadPoint = payload.key_points.find((point) => point.id === id);
    assert.ok(Array.isArray(sourcePoint.semanticAnchors) && sourcePoint.semanticAnchors.length > 0);
    assert.deepStrictEqual(payloadPoint.semantic_anchors, sourcePoint.semanticAnchors);
  });
  assert.strictEqual(validateRetellingEvaluationEvent({ material: payload, transcript: '复述内容。' }).material.id, item.id);
  const referenceChain = getMaterialCoreChain(item);
  assert.ok(referenceChain.every((entry) => entry.source === 'MATERIAL'));
  assert.ok(referenceChain.every((entry) => !item.keyPoints
    .flatMap((point) => point.semanticAnchors || []).includes(entry.text)));
});

function memoryStorage(initialLast = '') {
  let last = initialLast;
  let queue = [];
  return {
    getLast() { return last; },
    setLast(next) { last = next; },
    getQueue() { return queue.slice(); },
    setQueue(next) { queue = next.slice(); },
    snapshot() { return { last, queue: queue.slice() }; }
  };
}

const selectorStorage = memoryStorage();
const rotation = [];
for (let index = 0; index < 7; index += 1) {
  rotation.push(selectNextMaterial(materials, selectorStorage, () => 0).id);
}
assert.deepStrictEqual(rotation, [
  'retelling_002',
  'retelling_003',
  'retelling_004',
  'retelling_005',
  'retelling_006',
  'retelling_001',
  'retelling_002'
]);
assert.strictEqual(new Set(rotation.slice(0, 6)).size, 6);
assert.notStrictEqual(rotation[5], rotation[6], 'new cycle must not repeat its boundary material');

const legacyStorage = {
  value: 'retelling_002',
  get() { return this.value; },
  set(next) { this.value = next; }
};
assert.notStrictEqual(
  selectNextMaterial(materials, legacyStorage, () => 0).id,
  'retelling_002',
  'last-id-only storage remains compatible and avoids a cycle-boundary repeat'
);

const sessionStorage = memoryStorage();
let state = store.startNewSession(sessionStorage, () => 0);
assert.strictEqual(state.materialId, 'retelling_002');
const firstQueue = sessionStorage.snapshot().queue;
state = store.startNewSession(sessionStorage, () => 0);
assert.strictEqual(state.materialId, 'retelling_003');
const currentMaterialId = state.materialId;
const currentSessionId = state.sessionId;
state = store.restartCurrentMaterial();
assert.strictEqual(state.materialId, currentMaterialId);
assert.strictEqual(state.material.id, currentMaterialId);
assert.notStrictEqual(state.sessionId, currentSessionId);
assert.strictEqual(state.recordingCount, 0);
assert.deepStrictEqual(sessionStorage.snapshot().queue, firstQueue.slice(1),
  'retrying the same material must not consume the shuffle queue');

function dualRound(transcript, need) {
  return {
    transcript,
    taskResult: { taskStatus: 'RELATION_NOT_ESTABLISHED' },
    processResult: { processIssue: 'INFORMATION_ORDER' },
    routedResult: {
      primaryTrainingNeed: need,
      recommendedAction: 'REORDER_CAUSAL_CHAIN',
      evidence: []
    }
  };
}

assert.strictEqual(store.beginFirstRecording(), true);
assert.strictEqual(store.startProcessing(1), true);
const first = dualRound('第一次。', 'INFORMATION_ORDER');
assert.strictEqual(store.setFirstResult(first.transcript, first), true);
state = store.getState();
assert.strictEqual(state.firstRoundMaterialId, currentMaterialId);
assert.strictEqual(store.beginSecondRecording(), true);
assert.strictEqual(store.startProcessing(2), true);
const second = dualRound('第二次。', 'PASS');
assert.strictEqual(store.setProgressResult(second.transcript, second, {
  originalTrainingNeed: 'INFORMATION_ORDER',
  resolved: true,
  improvementType: 'ORDER_CLARIFIED',
  reasonCode: 'ORDER_ISSUE_REMOVED'
}), true);
state = store.getState();
assert.strictEqual(state.materialId, currentMaterialId);
assert.strictEqual(state.firstRoundMaterialId, currentMaterialId);
assert.strictEqual(state.secondRoundMaterialId, currentMaterialId);

function point(id, evidence, transcript) {
  const start = transcript.indexOf(evidence);
  return { id, covered: start >= 0, evidence, start, end: start + evidence.length };
}

function missingPresentationFor(item) {
  const k1 = item.keyPoints.find((entry) => entry.id === 'K1').displayText;
  const k2 = item.keyPoints.find((entry) => entry.id === 'K2').displayText;
  const k3 = item.keyPoints.find((entry) => entry.id === 'K3').displayText;
  const firstTranscript = `${k1}，${k3}。`;
  const secondTranscript = `${k1}，${k2}，所以${k3}。`;
  const relationEvidence = `${k2}，所以${k3}`;
  return presentRetellingResult({
    originalTrainingNeed: 'MISSING_CAUSAL_STEP',
    material: item,
    firstRoundResult: {
      transcript: firstTranscript,
      taskResult: { keyPoints: [point('K3', k3, firstTranscript)], relations: [] },
      processResult: {},
      routedResult: {}
    },
    secondRoundResult: {
      transcript: secondTranscript,
      taskResult: {
        keyPoints: [point('K2', k2, secondTranscript), point('K3', k3, secondTranscript)],
        relations: [{
          id: 'R2',
          status: 'CORRECT',
          fromEvidence: k2,
          toEvidence: k3,
          relationEvidence
        }]
      },
      processResult: {},
      routedResult: {}
    },
    progressResult: { resolved: true }
  });
}

materials.forEach((item) => {
  const presentation = missingPresentationFor(item);
  assert.strictEqual(presentation.showChange, true, `${item.id} presenter change`);
  assert.deepStrictEqual(presentation.beforeItems.map((entry) => entry.text), [
    item.keyPoints[2].displayText
  ]);
  assert.deepStrictEqual(presentation.afterItems.map((entry) => entry.text), [
    item.keyPoints[1].displayText,
    item.keyPoints[2].displayText
  ]);
  assert.ok(presentation.beforeItems.concat(presentation.afterItems)
    .every((entry) => entry.source === 'TRANSCRIPT'));
  assert.ok(!presentation.beforeItems.concat(presentation.afterItems)
    .some((entry) => ['通知很多', '逐渐习惯忽略提醒', '重要消息容易漏掉'].includes(entry.text)),
  `${item.id} presenter must not fall back to retelling_001 copy`);
});

console.log('retelling material library tests passed');
