const assert = require('assert');
const material = require('../../../eval/retelling-cases')[0].material;
const {
  buildGroundedFacts,
  hasClearRelationSemanticSupport,
  hasComprehensionFailure
} = require('../lib/retelling-grounded-facts');
const { validateRetellingContent } = require('../lib/retelling-content-evaluator');

function emptyPoints() {
  return material.key_points.map((item) => ({ id: item.id, covered: false, evidence: '' }));
}

const l07Text = '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。';
const l07Raw = {
  key_points: emptyPoints(),
  relations: [
    {
      id: 'R1',
      status: 'INCORRECT',
      from_evidence: '重要消息经常被漏掉',
      to_evidence: '人后来才开始忽略普通通知',
      relation_evidence: l07Text
    },
    { id: 'R2', status: 'MISSING', from_evidence: '', to_evidence: '', relation_evidence: '' }
  ],
  incorrect_claims: [{ claim: '因果方向相反', evidence: l07Text }],
  primary_training_need: 'INCORRECT_RELATION'
};
const l07Facts = buildGroundedFacts(l07Raw, { material, transcript: l07Text });
const recoveredR2 = l07Facts.relations.find((item) => item.id === 'R2');
assert.strictEqual(recoveredR2.status, 'INCORRECT');
assert.strictEqual(recoveredR2.fromEvidence, '人后来才开始忽略普通通知');
assert.strictEqual(recoveredR2.toEvidence, '重要消息经常被漏掉');
assert.strictEqual(recoveredR2.consistencyRecoveredFrom, 'R1');
assert.strictEqual(validateRetellingContent(l07Raw, { material, transcript: l07Text }).taskStatus, 'INCORRECT_RELATION');

const l09Text = '重要消息会被漏，然后人不看通知，然后通知很多，就是普通提醒太多，最后大家就会忽略。';
const l09Raw = {
  key_points: [
    { id: 'K1', covered: true, evidence: '通知很多，就是普通提醒太多' },
    { id: 'K2', covered: true, evidence: '最后大家就会忽略' },
    { id: 'K3', covered: true, evidence: '重要消息会被漏' }
  ],
  relations: [{
    id: 'R2',
    status: 'CORRECT',
    from_evidence: '最后大家就会忽略',
    to_evidence: '重要消息会被漏',
    relation_evidence: l09Text
  }],
  incorrect_claims: []
};
const l09Facts = buildGroundedFacts(l09Raw, { material, transcript: l09Text });
assert.strictEqual(hasClearRelationSemanticSupport(
  l09Facts.relations.find((item) => item.id === 'R2'), l09Text
), false);
assert.strictEqual(validateRetellingContent(l09Raw, { material, transcript: l09Text }).taskStatus, 'RELATION_NOT_ESTABLISHED');

const l14Text = '嗯……我其实没太看懂这段是什么意思。';
assert.strictEqual(hasComprehensionFailure(l14Text), true);
assert.strictEqual(validateRetellingContent({
  key_points: emptyPoints(),
  relations: material.relations.map((item) => ({
    id: item.id, status: 'MISSING', from_evidence: '', to_evidence: '', relation_evidence: ''
  })),
  incorrect_claims: []
}, { material, transcript: l14Text }).taskStatus, 'UNCERTAIN');

const partialText = '通知很多，所以重要消息容易漏掉。';
assert.strictEqual(validateRetellingContent({
  key_points: [{ id: 'K3', covered: true, evidence: '重要消息容易漏掉' }],
  relations: [{ id: 'R2', status: 'MISSING', from_evidence: '', to_evidence: '重要消息容易漏掉', relation_evidence: '' }],
  incorrect_claims: []
}, { material, transcript: partialText }).taskStatus, 'MISSING_CORE_CONTENT');

console.log('retelling grounded facts tests passed');
