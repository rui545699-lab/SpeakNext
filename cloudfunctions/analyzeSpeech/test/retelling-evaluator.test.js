const assert = require('assert');
const cases = require('../../../eval/retelling-cases');
const {
  createRetellingPayload,
  validateRetellingEvaluation,
  evaluateRetelling
} = require('../lib/retelling-evaluator');
const {
  validateRetellingProgress,
  createRetellingProgressPayload
} = require('../lib/retelling-progress-evaluator');
const {
  RETELLING_EVALUATOR_SYSTEM_PROMPT,
  RETELLING_RELATION_REPAIR_SYSTEM_PROMPT
} = require('../config/retelling-evaluator-prompt');
const { RETELLING_PROGRESS_SYSTEM_PROMPT } = require('../config/retelling-progress-prompt');

cases.forEach((item) => {
  const result = validateRetellingEvaluation(item.modelOutput, {
    material: item.material,
    transcript: item.transcript
  });
  assert.strictEqual(result.primary_training_need, item.gold, item.id);
  assert.strictEqual(result.recommended_action, item.gold == null
    ? 'PASS'
    : item.modelOutput.recommended_action, item.id);
  if (item.gold == null) assert.strictEqual(result.core_meaning_clear, true, item.id);
  result.relations.forEach((relation) => {
    assert.ok(['CORRECT', 'INCORRECT', 'MISSING', 'UNSUPPORTED'].includes(relation.status));
    if (relation.status === 'CORRECT' || relation.status === 'INCORRECT') {
      assert.ok(relation.from_evidence, `${item.id}:${relation.id}:from`);
      assert.ok(relation.to_evidence, `${item.id}:${relation.id}:to`);
      assert.ok(relation.relation_evidence, `${item.id}:${relation.id}:relation`);
    }
  });
});

const payload = createRetellingPayload('deepseek-flash', {
  material: cases[0].material,
  transcript: cases[0].transcript
});
assert.deepStrictEqual(payload.response_format, { type: 'json_object' });
assert.deepStrictEqual(payload.thinking, { type: 'disabled' });
assert.ok(RETELLING_EVALUATOR_SYSTEM_PROMPT.includes('K2 covered=true、K3 covered=true、R2 status=CORRECT'));
assert.ok(RETELLING_EVALUATOR_SYSTEM_PROMPT.includes('MISSING 不等于 INCORRECT'));
assert.ok(RETELLING_EVALUATOR_SYSTEM_PROMPT.includes('错误版本或相反版本'));
assert.ok(RETELLING_EVALUATOR_SYSTEM_PROMPT.includes('不得同时输出 R2.status=MISSING'));
assert.ok(RETELLING_RELATION_REPAIR_SYSTEM_PROMPT.includes('只输出 relations'));
assert.ok(RETELLING_EVALUATOR_SYSTEM_PROMPT.includes('K1、K4、K5 缺失不能单独触发训练'));
assert.ok(RETELLING_EVALUATOR_SYSTEM_PROMPT.includes('不得补写、纠正或猜测'));
assert.ok(RETELLING_PROGRESS_SYSTEM_PROMPT.includes('只判断第一次发现的一个训练问题'));

const firstCase = cases.find((item) => item.id === 'R02');
const firstEvaluation = validateRetellingEvaluation(firstCase.modelOutput, {
  material: firstCase.material,
  transcript: firstCase.transcript
});
const secondTranscript = '通知太多会让人习惯忽略提醒，所以重要消息也容易一起漏掉。';
const secondEvaluation = validateRetellingEvaluation({
  core_meaning_clear: true,
  key_points: [
    { id: 'K2', covered: true, evidence: '通知太多会让人习惯忽略提醒' },
    { id: 'K3', covered: true, evidence: '重要消息也容易一起漏掉' }
  ],
  relations: [
    {
      id: 'R2',
      status: 'CORRECT',
      from_evidence: '通知太多会让人习惯忽略提醒',
      to_evidence: '重要消息也容易一起漏掉',
      relation_evidence: '通知太多会让人习惯忽略提醒，所以重要消息也容易一起漏掉'
    }
  ],
  incorrect_claims: [],
  primary_training_need: null,
  recommended_action: 'PASS',
  evidence: [],
  reason: 'fixture'
}, {
  material: firstCase.material,
  transcript: secondTranscript
});
const resolved = validateRetellingProgress({
  original_training_need: 'MISSING_CAUSAL_STEP',
  resolved: true,
  before_evidence: '通知很多，所以重要消息容易漏掉',
  after_evidence: '让人习惯忽略提醒，所以重要消息也容易一起漏掉',
  improvement_type: 'CAUSAL_LINK_ADDED',
  core_meaning_clear_after: true,
  reason: 'fixture'
}, {
  material: firstCase.material,
  first_transcript: firstCase.transcript,
  first_evaluation: firstEvaluation,
  second_transcript: secondTranscript,
  second_evaluation: secondEvaluation
});
assert.strictEqual(resolved.resolved, true);
assert.strictEqual(resolved.core_meaning_clear_after, true);

const ungrounded = validateRetellingProgress({
  original_training_need: 'MISSING_CAUSAL_STEP',
  resolved: true,
  before_evidence: '通知很多，所以重要消息容易漏掉',
  after_evidence: '用户形成了完整的忽略习惯',
  improvement_type: 'CAUSAL_LINK_ADDED',
  core_meaning_clear_after: true,
  reason: 'fixture'
}, {
  material: firstCase.material,
  first_transcript: firstCase.transcript,
  first_evaluation: firstEvaluation,
  second_transcript: secondTranscript,
  second_evaluation: {
    core_meaning_clear: false,
    key_points: [],
    relations: [],
    incorrect_claims: [],
    primary_training_need: 'UNCERTAIN',
    recommended_action: 'OBSERVE_AGAIN',
    evidence: []
  }
});
assert.strictEqual(ungrounded.resolved, false);
assert.strictEqual(ungrounded.after_evidence, '');
assert.strictEqual(ungrounded.core_meaning_clear_after, false);

const progressPayload = createRetellingProgressPayload('deepseek-flash', {
  material: firstCase.material,
  first_transcript: firstCase.transcript,
  first_evaluation: firstEvaluation,
  second_transcript: secondTranscript
});
assert.deepStrictEqual(progressPayload.response_format, { type: 'json_object' });
assert.deepStrictEqual(progressPayload.thinking, { type: 'disabled' });

const ungroundedFirst = validateRetellingEvaluation({
  core_meaning_clear: true,
  key_points: [
    { id: 'K2', covered: true, evidence: '用户形成忽略通知的习惯' },
    { id: 'K3', covered: true, evidence: '重要消息被漏掉' }
  ],
  relations: [{
    id: 'R2',
    status: 'CORRECT',
    from_evidence: '用户形成忽略通知的习惯',
    to_evidence: '重要消息被漏掉',
    relation_evidence: '所以形成了完整因果链'
  }],
  incorrect_claims: [],
  primary_training_need: null,
  recommended_action: 'PASS',
  evidence: [],
  reason: 'fixture'
}, {
  material: firstCase.material,
  transcript: '通知很多，所以重要消息容易漏掉。'
});
assert.strictEqual(ungroundedFirst.core_meaning_clear, false);
assert.strictEqual(ungroundedFirst.primary_training_need, 'UNCERTAIN');
assert.strictEqual(ungroundedFirst.relations.find((item) => item.id === 'R2').status, 'UNSUPPORTED');

async function testStructuredRetry() {
  let calls = 0;
  const evaluation = await evaluateRetelling({
    material: cases[0].material,
    transcript: cases[0].transcript
  }, async () => {
    calls += 1;
    return calls === 1
      ? { id: 'empty', model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: '' } }] }
      : {
        id: 'success',
        model: 'deepseek-flash',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(cases[0].modelOutput) } }]
      };
  });
  assert.strictEqual(calls, 2);
  assert.strictEqual(evaluation.retryCount, 1);
  assert.strictEqual(evaluation.evaluation.core_meaning_clear, true);
}

testStructuredRetry()
  .then(() => console.log('retelling evaluator tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
