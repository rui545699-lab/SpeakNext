const assert = require('assert');
const {
  validateDiagnosis,
  isExplicitlyNotApplicable,
  isTemporaryStartDifficulty
} = require('../lib/deepseek-evaluator');
const { EVALUATOR_SYSTEM_PROMPT } = require('../config/evaluator-prompt');

assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('当前最直接阻碍用户继续表达的问题'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('filler_count 高'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('普通日常回答重复“然后”'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('question_applicable'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('“正在想”不等于“无法开始”'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('Evidence 可引用不等于 Evidence 足以支持 diagnosis'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('回答“嗯，我想一下……”'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('回答“我完全不知道说什么，也不知道从哪个说。”'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('回答“其实那个还是有很多……别人的精英。”'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('回答“嗯，不知道说什么。”'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('即使 filler 很多，只要后续已经给出明确对象和内容'));
assert.ok(EVALUATOR_SYSTEM_PROMPT.includes('不得使用“confidence 低于某个阈值就判 UNCERTAIN”的规则'));

assert.strictEqual(isExplicitlyNotApplicable('最近没有，我和朋友没什么分歧。'), true);
assert.strictEqual(isExplicitlyNotApplicable('嗯，我知道有一个，但一下子不知道从哪个说。'), false);
assert.strictEqual(isExplicitlyNotApplicable('我没有这种情况。'), true);
assert.strictEqual(isExplicitlyNotApplicable('最近没有。'), true);
assert.strictEqual(isExplicitlyNotApplicable('我和朋友没什么分歧。'), true);
assert.strictEqual(isExplicitlyNotApplicable('我没有用过这种 App。'), true);
assert.strictEqual(isExplicitlyNotApplicable('这个我没经历过。'), true);
assert.strictEqual(isExplicitlyNotApplicable('我没有这种东西。'), true);
assert.strictEqual(isExplicitlyNotApplicable('想不出来。'), false);
assert.strictEqual(isExplicitlyNotApplicable('一下想不到。'), false);
assert.strictEqual(isExplicitlyNotApplicable('不知道说什么。'), false);
assert.strictEqual(isExplicitlyNotApplicable('想不到，我没有这种情况。'), true);

['想不出来。', '一下想不到。', '不知道说什么。'].forEach((transcript) => {
  const startResult = validateDiagnosis({
    question_applicable: false,
    needs_intervention: false,
    primary_issue: null,
    confidence: 0.8,
    evidence: [],
    question_factor: 'NONE'
  }, {
    transcript,
    question_openness: 'MEDIUM'
  });
  assert.strictEqual(startResult.question_applicable, true);
  assert.strictEqual(startResult.primary_issue, 'CONTENT_START');
  assert.strictEqual(startResult.needs_intervention, true);
});
assert.strictEqual(isTemporaryStartDifficulty('嗯，想不出来了。'), true);

const notApplicable = validateDiagnosis({
  question_applicable: true,
  needs_intervention: true,
  primary_issue: 'CONTENT_START',
  confidence: 0.91,
  evidence: [{ text: '最近没有', type: 'no_start' }],
  question_factor: 'NONE'
}, {
  transcript: '最近没有，我和朋友没什么分歧。',
  question_openness: 'MEDIUM',
  question_task_type: 'OPINION_DIFFERENCE',
  question_required_slots: ['topic', 'my_view', 'other_view', 'difference']
});
assert.strictEqual(notApplicable.question_applicable, false);
assert.strictEqual(notApplicable.needs_intervention, false);
assert.strictEqual(notApplicable.primary_issue, null);
assert.strictEqual(notApplicable.recommended_intervention, null);

const applicableStart = validateDiagnosis({
  question_applicable: true,
  needs_intervention: true,
  primary_issue: 'CONTENT_START',
  confidence: 0.8,
  evidence: [{ text: '一下子不知道从哪个说', type: 'start_hesitation' }],
  question_factor: 'NONE'
}, {
  transcript: '嗯，我知道有一个，但我一下子不知道从哪个说。',
  question_openness: 'MEDIUM',
  question_task_type: 'OPINION_DIFFERENCE',
  question_required_slots: ['topic', 'my_view', 'other_view', 'difference']
});
assert.strictEqual(applicableStart.question_applicable, true);
assert.strictEqual(applicableStart.primary_issue, 'CONTENT_START');

const input = {
  transcript: '这个地方怎么说呢，挺舒服的。',
  question_openness: 'MEDIUM'
};

const lexical = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'LEXICAL_RETRIEVAL',
  confidence: 0.88,
  evidence: [{ text: '怎么说呢', type: 'explicit_lexical_search' }],
  question_factor: 'NONE',
  recommended_intervention: 'MODEL_TRIED_TO_CHANGE_THIS'
}, input);

assert.strictEqual(lexical.recommended_intervention, 'SEMANTIC_CONTRAST');
assert.strictEqual(lexical.needs_intervention, true);
assert.strictEqual(lexical.evidence.length, 1);

const deferred = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'CONTENT_START',
  confidence: 0.7,
  evidence: [],
  question_factor: 'NONE'
}, { transcript: '嗯。', question_openness: 'HIGH' });

assert.strictEqual(deferred.primary_issue, 'UNCERTAIN');
assert.strictEqual(deferred.question_factor, 'TOO_OPEN');
assert.strictEqual(deferred.recommended_intervention, 'OBSERVE_AGAIN');

const complete = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'CONTENT_EXPAND',
  confidence: 0.92,
  evidence: [{ text: '挺方便', type: 'abstract_judgment' }],
  question_factor: 'NONE',
  recommended_intervention: 'ONE_DETAIL'
}, {
  transcript: '电瓶车。我原来觉得骑起来很难，实际骑了以后发现挺方便。',
  question_openness: 'HIGH',
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after']
});
assert.strictEqual(complete.needs_intervention, false);
assert.strictEqual(complete.primary_issue, null);
assert.strictEqual(complete.recommended_intervention, null);
assert.deepStrictEqual(complete.evidence, []);

const needsExpansion = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'CONTENT_EXPAND',
  confidence: 0.82,
  evidence: [{ text: '因为挺好的', type: 'missing_required_reason' }],
  question_factor: 'NONE',
  recommended_intervention: 'ONE_DETAIL'
}, {
  transcript: '因为挺好的。',
  question_openness: 'MEDIUM',
  question_task_type: 'REASON',
  question_required_slots: ['reason']
});
assert.strictEqual(needsExpansion.needs_intervention, true);
assert.strictEqual(needsExpansion.primary_issue, 'CONTENT_EXPAND');

const startDifficulty = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'CONTENT_START',
  confidence: 0.81,
  evidence: [{ text: '我想一想', type: 'start_hesitation' }],
  question_factor: 'NONE',
  recommended_intervention: 'NARROW_SCOPE'
}, {
  transcript: '嗯，我想一想，嗯。',
  question_openness: 'HIGH',
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after']
});
assert.strictEqual(startDifficulty.needs_intervention, true);
assert.strictEqual(startDifficulty.primary_issue, 'CONTENT_START');
assert.strictEqual(startDifficulty.recommended_intervention, 'NARROW_SCOPE');

const missingExpectation = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'CONTENT_EXPAND',
  confidence: 0.84,
  evidence: [{ text: '感觉挺好的', type: 'missing_expectation' }],
  question_factor: 'NONE'
}, {
  transcript: '电瓶车吧，感觉挺好的。',
  question_text: '最近有没有一个你原来觉得不太好用，后来用了发现还不错的东西？',
  question_openness: 'MEDIUM',
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after']
});
assert.strictEqual(missingExpectation.needs_intervention, true);
assert.strictEqual(missingExpectation.primary_issue, 'CONTENT_EXPAND');
assert.deepStrictEqual(missingExpectation.missing_required_slots, ['expectation_before']);

const completeWithFillers = validateDiagnosis({
  needs_intervention: true,
  primary_issue: 'CONTENT_START',
  confidence: 0.72,
  evidence: [{ text: '嗯', type: 'filler' }],
  question_factor: 'NONE'
}, {
  transcript: '嗯，电瓶车吧。呃，我原来觉得很难骑，后来骑了，嗯，发现挺方便。',
  question_text: '最近有没有一个你原来觉得不太好用，后来用了发现还不错的东西？',
  question_openness: 'MEDIUM',
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after']
});
assert.strictEqual(completeWithFillers.needs_intervention, false);
assert.strictEqual(completeWithFillers.primary_issue, null);
console.log('evaluator-validation tests passed');
