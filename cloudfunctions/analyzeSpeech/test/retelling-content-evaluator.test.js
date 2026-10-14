const assert = require('assert');
const material = require('../../../eval/retelling-cases')[0].material;
const {
  validateRetellingContent,
  createRetellingContentPayload
} = require('../lib/retelling-content-evaluator');
const { RETELLING_CONTENT_SYSTEM_PROMPT } = require('../config/retelling-content-prompt');

function raw(points, relation, incorrectClaims = []) {
  return {
    key_points: Object.keys(points).map((id) => ({ id, covered: true, evidence: points[id] })),
    relations: [relation],
    incorrect_claims: incorrectClaims
  };
}

function r2(status, from = '', to = '', evidence = '') {
  return { id: 'R2', status, from_evidence: from, to_evidence: to, relation_evidence: evidence };
}

const l04Text = '通知很多，所以重要消息容易漏掉。';
const l04 = validateRetellingContent(raw(
  { K1: '通知很多', K3: '重要消息容易漏掉' },
  r2('MISSING', '', '重要消息容易漏掉')
), { material, transcript: l04Text });
assert.strictEqual(l04.taskStatus, 'MISSING_CORE_CONTENT');
assert.deepStrictEqual(l04.missingCorePointIds, ['K2']);
assert.strictEqual(l04.requiresNewContent, true);

const l07Text = '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。';
const l07 = validateRetellingContent(raw(
  { K2: '人后来才开始忽略普通通知', K3: '重要消息经常被漏掉' },
  r2('INCORRECT', '人后来才开始忽略普通通知', '重要消息经常被漏掉', l07Text)
), { material, transcript: l07Text });
assert.strictEqual(l07.taskStatus, 'INCORRECT_RELATION');
assert.strictEqual(l07.relations.find((item) => item.id === 'R2').status, 'INCORRECT');

const l09Text = '重要消息会被漏，然后人不看通知，然后通知很多，就是普通提醒太多，最后大家就会忽略。';
const l09 = validateRetellingContent(raw(
  { K1: '通知很多', K2: '人不看通知', K3: '重要消息会被漏' },
  r2('MISSING', '人不看通知', '重要消息会被漏')
), { material, transcript: l09Text });
assert.strictEqual(l09.taskStatus, 'RELATION_NOT_ESTABLISHED');
assert.strictEqual(l09.coreFactsComplete, true);
assert.strictEqual(l09.requiresNewContent, false);
assert.strictEqual(l09.keyPoints.find((item) => item.id === 'K3').start, 0);

const passText = '人会习惯忽略提醒，所以重要消息也会漏掉。';
const pass = validateRetellingContent(raw(
  { K2: '人会习惯忽略提醒', K3: '重要消息也会漏掉' },
  r2('CORRECT', '人会习惯忽略提醒', '重要消息也会漏掉', passText)
), { material, transcript: passText });
assert.strictEqual(pass.taskStatus, 'PASS');
assert.strictEqual(pass.coreMeaningClear, true);

const unsupported = validateRetellingContent(raw(
  { K2: '人会习惯忽略提醒', K3: '重要消息也会漏掉' },
  r2('CORRECT', '人会习惯忽略提醒', '重要消息也会漏掉', '不存在的关系证据')
), { material, transcript: passText });
assert.strictEqual(unsupported.taskStatus, 'UNCERTAIN');

const payload = createRetellingContentPayload('deepseek-flash', { material, transcript: passText });
assert.deepStrictEqual(payload.response_format, { type: 'json_object' });
assert.deepStrictEqual(payload.thinking, { type: 'disabled' });
assert.ok(RETELLING_CONTENT_SYSTEM_PROMPT.includes('semantic_anchors'));
assert.ok(!RETELLING_CONTENT_SYSTEM_PROMPT.includes('忽略提醒习惯'));
assert.ok(RETELLING_CONTENT_SYSTEM_PROMPT.includes('R2=K2→K3'));
console.log('retelling content evaluator tests passed');
