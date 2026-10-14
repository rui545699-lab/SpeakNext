'use strict';

const assert = require('assert');
const legacyMaterial = require('../eval/fixtures/retelling-001-notification-legacy');
const productionMaterials = require('../data/retelling-materials');
const fixtures = require('../eval/retelling-dual-progress-cases');
const {
  PRESENTATION_TYPES,
  presentRetellingResult
} = require('../utils/retelling-result-presenter');

const material = legacyMaterial;

function fixture(id) {
  return fixtures.find((item) => item.id === id);
}

function present(id) {
  const item = fixture(id);
  return presentRetellingResult({
    originalTrainingNeed: item.originalTrainingNeed,
    firstRoundResult: item.firstRoundResult,
    secondRoundResult: item.secondRoundResult,
    progressResult: Object.assign({ originalTrainingNeed: item.originalTrainingNeed }, item.gold),
    material
  });
}

function itemTexts(items) {
  return items.map((item) => item.text);
}

function assertGrounded(presentation, item) {
  presentation.beforeItems.forEach((entry) => {
    assert.strictEqual(entry.source, 'TRANSCRIPT');
    assert.ok(item.firstRoundResult.transcript.includes(entry.text), `before not grounded: ${entry.text}`);
  });
  presentation.afterItems.forEach((entry) => {
    assert.strictEqual(entry.source, 'TRANSCRIPT');
    assert.ok(item.secondRoundResult.transcript.includes(entry.text), `after not grounded: ${entry.text}`);
  });
}

let result = present('P01_missing_resolved');
assert.strictEqual(result.title, '关键原因补上了');
assert.strictEqual(result.presentationType, PRESENTATION_TYPES.CAUSAL_CHAIN);
assert.deepStrictEqual(itemTexts(result.beforeItems), ['重要消息容易漏掉']);
assert.deepStrictEqual(itemTexts(result.afterItems), ['人会习惯忽略提醒', '重要消息也容易漏掉']);
assert.strictEqual(result.summary, '第二次把中间的原因补完整了。');
assertGrounded(result, fixture('P01_missing_resolved'));

const metal = productionMaterials.find((item) => item.id === 'retelling_002');
const metalFirstTranscript = '金属和木头温度差不多，但是摸金属会觉得更冷。';
const metalSecondTranscript = '金属传递热量的速度比木头快，会更快带走手上的热量，所以手指降温更快，摸起来也就更冷。';
const metalPresentation = presentRetellingResult({
  originalTrainingNeed: 'MISSING_CAUSAL_STEP',
  material: metal,
  firstRoundResult: {
    transcript: metalFirstTranscript,
    taskResult: { keyPoints: [
      { id: 'K1', covered: false, evidence: '' },
      { id: 'K2', covered: false, evidence: '' },
      { id: 'K3', covered: true, evidence: '摸金属会觉得更冷' },
      { id: 'K4', covered: true, evidence: '金属和木头温度差不多' }
    ], relations: [] },
    processResult: {}, routedResult: {}
  },
  secondRoundResult: {
    transcript: metalSecondTranscript,
    taskResult: { keyPoints: [
      { id: 'K2', covered: true, evidence: '金属传递热量的速度比木头快，会更快带走手上的热量' },
      { id: 'K3', covered: true, evidence: '手指降温更快，摸起来也就更冷' }
    ], relations: [{
      id: 'R2', status: 'CORRECT',
      fromEvidence: '金属传递热量的速度比木头快，会更快带走手上的热量',
      toEvidence: '手指降温更快，摸起来也就更冷',
      relationEvidence: metalSecondTranscript
    }] },
    processResult: {}, routedResult: {}
  },
  progressResult: { resolved: true }
});
assert.deepStrictEqual(itemTexts(metalPresentation.beforeItems), ['摸金属会觉得更冷']);
assert.deepStrictEqual(itemTexts(metalPresentation.afterItems), [
  '金属传递热量的速度比木头快，会更快带走手上的热量',
  '手指降温更快，摸起来也就更冷'
]);
assert.ok(!itemTexts(metalPresentation.beforeItems).includes('热量从手传向物体'));
assert.ok(metalPresentation.beforeItems.concat(metalPresentation.afterItems)
  .every((entry) => entry.source === 'TRANSCRIPT'));

const insufficient = JSON.parse(JSON.stringify({
  originalTrainingNeed: 'MISSING_CAUSAL_STEP',
  material: metal,
  firstRoundResult: {
    transcript: '金属和木头放在一起。',
    taskResult: { keyPoints: [{ id: 'K1', covered: true, evidence: '金属和木头' }], relations: [] },
    processResult: {}, routedResult: {}
  },
  secondRoundResult: metalPresentation,
  progressResult: { resolved: true }
}));
insufficient.secondRoundResult = {
  transcript: metalSecondTranscript,
  taskResult: { keyPoints: [
    { id: 'K2', covered: true, evidence: '金属传递热量的速度比木头快，会更快带走手上的热量' },
    { id: 'K3', covered: true, evidence: '手指降温更快，摸起来也就更冷' }
  ], relations: [{ id: 'R2', status: 'CORRECT', fromEvidence: '金属传递热量的速度比木头快，会更快带走手上的热量', toEvidence: '手指降温更快，摸起来也就更冷', relationEvidence: metalSecondTranscript }] },
  processResult: {}, routedResult: {}
};
const insufficientPresentation = presentRetellingResult(insufficient);
assert.strictEqual(insufficientPresentation.showChange, false);
assert.deepStrictEqual(insufficientPresentation.beforeItems, []);
assert.deepStrictEqual(insufficientPresentation.afterItems, []);

result = present('P03_incorrect_resolved');
assert.strictEqual(result.presentationType, PRESENTATION_TYPES.RELATION_DIRECTION);
assert.deepStrictEqual(itemTexts(result.beforeItems), ['重要消息被漏掉', '人开始忽略普通通知']);
assert.deepStrictEqual(itemTexts(result.afterItems), ['人习惯忽略普通通知', '重要消息也会一起被漏掉']);
assertGrounded(result, fixture('P03_incorrect_resolved'));

result = present('P05_lexical_resolved');
assert.strictEqual(result.presentationType, PRESENTATION_TYPES.LEXICAL_PARAPHRASE);
assert.deepStrictEqual(itemTexts(result.beforeItems), ['怎么说']);
assert.deepStrictEqual(itemTexts(result.afterItems), ['人会习惯忽略通知，重要消息也容易一起漏掉']);
assert.strictEqual(result.summary, '第二次换了一种说法，意思也保留下来了。');
assertGrounded(result, fixture('P05_lexical_resolved'));

result = present('P07_order_resolved');
assert.strictEqual(result.presentationType, PRESENTATION_TYPES.ORDER_SEQUENCE);
assert.deepStrictEqual(itemTexts(result.beforeItems), ['重要消息先漏掉', '人不看通知']);
assert.deepStrictEqual(itemTexts(result.afterItems), ['人先习惯忽略通知', '重要消息也会被漏掉']);
assertGrounded(result, fixture('P07_order_resolved'));

result = present('P11_uncertain_became_evaluable');
assert.strictEqual(result, null, 'a clarified but unresolved issue must not receive a success presenter');

const unsafe = JSON.parse(JSON.stringify(fixture('P03_incorrect_resolved')));
unsafe.secondRoundResult.taskResult.relations[0].relationEvidence = '用户没有说过的内容';
result = presentRetellingResult({
  originalTrainingNeed: unsafe.originalTrainingNeed,
  firstRoundResult: unsafe.firstRoundResult,
  secondRoundResult: unsafe.secondRoundResult,
  progressResult: { resolved: true },
  material
});
assert.strictEqual(result.showChange, false);
assert.deepStrictEqual(result.beforeItems, []);
assert.deepStrictEqual(result.afterItems, []);

const unresolved = fixture('P02_missing_unresolved');
assert.strictEqual(presentRetellingResult({
  originalTrainingNeed: unresolved.originalTrainingNeed,
  firstRoundResult: unresolved.firstRoundResult,
  secondRoundResult: unresolved.secondRoundResult,
  progressResult: { resolved: false },
  material
}), null);

assert.strictEqual(presentRetellingResult({
  originalTrainingNeed: 'PASS',
  firstRoundResult: fixture('P01_missing_resolved').secondRoundResult,
  secondRoundResult: null,
  progressResult: null,
  material
}), null);

console.log('retelling result presenter tests passed');
