const assert = require('assert');
const material = require('../../../eval/retelling-cases')[0].material;
const { validateRetellingContent } = require('../lib/retelling-content-evaluator');
const { analyzeRetellingProcess } = require('../lib/retelling-process-analyzer');

function content(transcript, points, relationStatus = 'MISSING', relationEvidence = {}) {
  return validateRetellingContent({
    key_points: Object.keys(points).map((id) => ({ id, covered: true, evidence: points[id] })),
    relations: [Object.assign({
      id: 'R2', status: relationStatus, from_evidence: '', to_evidence: '', relation_evidence: ''
    }, relationEvidence)],
    incorrect_claims: []
  }, { material, transcript });
}

const missingText = '通知很多，所以重要消息容易漏掉。';
const missingTask = content(missingText, { K1: '通知很多', K3: '重要消息容易漏掉' });
assert.strictEqual(analyzeRetellingProcess({ transcript: missingText, material, taskResult: missingTask }).processIssue, 'NONE');

const l09Text = '重要消息会被漏，然后人不看通知，然后通知很多，就是普通提醒太多，最后大家就会忽略。';
const l09Task = content(l09Text, { K1: '通知很多', K2: '人不看通知', K3: '重要消息会被漏' }, 'MISSING', {
  from_evidence: '人不看通知', to_evidence: '重要消息会被漏'
});
const l09 = analyzeRetellingProcess({ transcript: l09Text, material, taskResult: l09Task });
assert.strictEqual(l09.processIssue, 'INFORMATION_ORDER');
assert.strictEqual(l09.orderAnalysis.eligible, true);
assert.deepStrictEqual(l09.orderAnalysis.observedOrder.slice(0, 3), ['K3', 'K2', 'K1']);

const l10Text = '最后重要信息没看到，然后普通通知很多，人后来会不看，反正这些提醒一直出现。';
const l10Task = content(l10Text, { K1: '普通通知很多', K2: '人后来会不看', K3: '重要信息没看到' }, 'MISSING', {
  from_evidence: '人后来会不看', to_evidence: '重要信息没看到'
});
assert.strictEqual(analyzeRetellingProcess({ transcript: l10Text, material, taskResult: l10Task }).processIssue, 'INFORMATION_ORDER');

const wrongText = '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。';
const wrongTask = content(wrongText, { K2: '人后来才开始忽略普通通知', K3: '重要消息经常被漏掉' }, 'INCORRECT', {
  from_evidence: '人后来才开始忽略普通通知',
  to_evidence: '重要消息经常被漏掉',
  relation_evidence: wrongText
});
assert.strictEqual(analyzeRetellingProcess({ transcript: wrongText, material, taskResult: wrongTask }).processIssue, 'NONE');

const falseLexicalText = '这个事情怎么说都可以，通知很多。';
const falseLexicalTask = content(falseLexicalText, { K1: '通知很多' });
assert.strictEqual(analyzeRetellingProcess({ transcript: falseLexicalText, material, taskResult: falseLexicalTask }).processIssue, 'NONE');

const lexicalText = '提醒一直弹，人慢慢会……怎么形容，就是有点不想再认真看的感觉。';
const lexicalTask = content(lexicalText, { K2: '有点不想再认真看的感觉' });
const lexical = analyzeRetellingProcess({ transcript: lexicalText, material, taskResult: lexicalTask });
assert.strictEqual(lexical.processIssue, 'LEXICAL_RETRIEVAL');
assert.strictEqual(lexical.lexicalMarkers[0].text, '怎么形容');
console.log('retelling process analyzer tests passed');
