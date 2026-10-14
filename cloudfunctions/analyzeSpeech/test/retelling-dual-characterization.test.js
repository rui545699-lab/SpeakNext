const assert = require('assert');
const material = require('../../../eval/retelling-cases')[0].material;
const { validateRetellingContent } = require('../lib/retelling-content-evaluator');
const { composeRetellingDualEvaluation } = require('../lib/retelling-dual-evaluator');

function run(transcript, keyPoints, relation) {
  const taskResult = validateRetellingContent({
    key_points: Object.keys(keyPoints).map((id) => ({ id, covered: true, evidence: keyPoints[id] })),
    relations: [Object.assign({
      id: 'R2', status: 'MISSING', from_evidence: '', to_evidence: '', relation_evidence: ''
    }, relation)],
    incorrect_claims: []
  }, { material, transcript });
  return composeRetellingDualEvaluation({ material, transcript }, taskResult);
}

const l04 = run('通知很多，所以重要消息容易漏掉。', {
  K1: '通知很多', K3: '重要消息容易漏掉'
}, { to_evidence: '重要消息容易漏掉' });
assert.deepStrictEqual([
  l04.taskResult.taskStatus, l04.processResult.processIssue, l04.routedResult.primaryTrainingNeed
], ['MISSING_CORE_CONTENT', 'NONE', 'MISSING_CAUSAL_STEP']);

const l07Text = '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。';
const l07 = run(l07Text, {
  K2: '人后来才开始忽略普通通知', K3: '重要消息经常被漏掉'
}, {
  status: 'INCORRECT',
  from_evidence: '人后来才开始忽略普通通知',
  to_evidence: '重要消息经常被漏掉',
  relation_evidence: l07Text
});
assert.strictEqual(l07.taskResult.taskStatus, 'INCORRECT_RELATION');
assert.strictEqual(l07.routedResult.primaryTrainingNeed, 'INCORRECT_RELATION');

const l09Text = '重要消息会被漏，然后人不看通知，然后通知很多，就是普通提醒太多，最后大家就会忽略。';
const l09 = run(l09Text, {
  K1: '通知很多', K2: '人不看通知', K3: '重要消息会被漏'
}, { from_evidence: '人不看通知', to_evidence: '重要消息会被漏' });
assert.deepStrictEqual([
  l09.taskResult.taskStatus, l09.processResult.processIssue, l09.routedResult.primaryTrainingNeed
], ['RELATION_NOT_ESTABLISHED', 'INFORMATION_ORDER', 'INFORMATION_ORDER']);
assert.strictEqual(l09.taskResult.coreFactsComplete, true);
assert.strictEqual(l09.taskResult.requiresNewContent, false);

const l10Text = '最后重要信息没看到，然后普通通知很多，人后来会不看，反正这些提醒一直出现。';
const l10 = run(l10Text, {
  K1: '普通通知很多', K2: '人后来会不看', K3: '重要信息没看到'
}, { from_evidence: '人后来会不看', to_evidence: '重要信息没看到' });
assert.deepStrictEqual([
  l10.taskResult.taskStatus, l10.processResult.processIssue, l10.routedResult.primaryTrainingNeed
], ['RELATION_NOT_ESTABLISHED', 'INFORMATION_ORDER', 'INFORMATION_ORDER']);

const l12Text = '提醒一直弹，人慢慢会……怎么形容，就是有点不想再认真看的感觉。';
const l12 = run(l12Text, { K2: '有点不想再认真看的感觉' }, {
  from_evidence: '有点不想再认真看的感觉'
});
assert.strictEqual(l12.processResult.processIssue, 'LEXICAL_RETRIEVAL');
assert.strictEqual(l12.routedResult.primaryTrainingNeed, 'LEXICAL_RETRIEVAL');
assert.strictEqual(l12.processResult.lexicalMarkers[0].text, '怎么形容');

console.log('retelling dual characterization tests passed');
