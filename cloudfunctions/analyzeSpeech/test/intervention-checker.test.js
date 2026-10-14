const assert = require('assert');
const {
  CHECK_MAX_TOKENS,
  MAX_CHECK_RETRIES,
  validateCheckInput,
  validateCheckOutput,
  createCheckPayload,
  evaluateInterventionCheck
} = require('../lib/intervention-checker');

const input = {
  intervention_type: 'ONE_DETAIL',
  before_transcript: '因为我觉得它比较方便。',
  after_transcript: '想去哪儿就去哪儿，也不用走路。',
  anchor: '方便',
  phase: 'COMPLETE_INTERVENTION',
  original_question: '为什么觉得方便？',
  question_task_type: '',
  question_required_slots: [],
  slot_state: {},
  target_slot: '',
  current_prompt: ''
};

function response(content, id = 'check-request') {
  return {
    id,
    model: 'deepseek-flash',
    choices: [{ finish_reason: 'stop', message: { content } }]
  };
}

assert.deepStrictEqual(validateCheckInput(input), input);
assert.throws(
  () => validateCheckInput(Object.assign({}, input, { intervention_type: 'OBSERVE_AGAIN' })),
  /INVALID_INTERVENTION_TYPE/
);
assert.deepStrictEqual(validateCheckOutput({ result: 'UNKNOWN', reason: 'x' }), {
  result: 'RETRY',
  intervention_pass: false,
  original_task_complete: false,
  missing_required_slots: [],
  slot_state: {},
  slot_evidence: { target_slot: '', filled: false, value: '', evidence: '' },
  reason: '本轮最小动作尚未完成。'
});
const payload = createCheckPayload('deepseek-flash', input);
assert.deepStrictEqual(payload.response_format, { type: 'json_object' });
assert.deepStrictEqual(payload.thinking, { type: 'disabled' });
assert.strictEqual(payload.max_tokens, CHECK_MAX_TOKENS);
assert.strictEqual(CHECK_MAX_TOKENS, 420);

const restoredObjectInput = validateCheckInput({
  intervention_type: 'ONE_DETAIL',
  before_transcript: '嗯，小红书吧。',
  after_transcript: '可以学到很多别人的经验。',
  phase: 'COMPLETE_INTERVENTION',
  original_question: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after'],
  slot_state: {
    object: { filled: true, value: '' },
    expectation_before: { filled: false, value: '' },
    experience_after: { filled: false, value: '' }
  },
  target_slot: 'experience_after',
  current_prompt: '它实际体验起来，有哪一点比你原来想象中更好？'
});
assert.deepStrictEqual(restoredObjectInput.slot_state.object, {
  filled: true,
  value: '小红书',
  evidence: '小红书'
});

(async () => {
  let calls = 0;
  const passed = await evaluateInterventionCheck(input, async () => {
    calls += 1;
    return response(JSON.stringify({
      result: 'PASS',
      reason: '新增了具体出行场景',
      original_task_complete: true
    }));
  });
  assert.strictEqual(calls, 1);
  assert.strictEqual(passed.result, 'PASS');

  calls = 0;
  const retried = await evaluateInterventionCheck(input, async () => {
    calls += 1;
    return calls === 1
      ? response('')
      : response(JSON.stringify({ result: 'RETRY', reason: '仍然只有概括判断' }));
  });
  assert.strictEqual(calls, MAX_CHECK_RETRIES + 1);
  assert.strictEqual(retried.result, 'RETRY');

  const narrowObject = await evaluateInterventionCheck({
    intervention_type: 'NARROW_SCOPE',
    before_transcript: '嗯，我想一想。',
    after_transcript: '西湖醋鱼。',
    anchor: '吃过的',
    phase: 'FIND_OBJECT',
    original_question: '最近有没有一个东西，实际体验比你原来想象中更好？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '找到了具体对象',
    original_task_complete: true
  })));
  assert.strictEqual(narrowObject.interventionPass, true);
  assert.strictEqual(narrowObject.originalTaskComplete, false);

  const narrowMetadataObject = await evaluateInterventionCheck({
    intervention_type: 'NARROW_SCOPE',
    before_transcript: '嗯，不知道说什么。',
    after_transcript: '云南。',
    anchor: '去过的',
    phase: 'FIND_OBJECT',
    original_question: '最近去过哪个地方，实际感觉和出发前想的不一样？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after']
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '找到了具体对象',
    original_task_complete: true
  })));
  assert.strictEqual(narrowMetadataObject.interventionPass, true);
  assert.strictEqual(narrowMetadataObject.originalTaskComplete, false);
  assert.deepStrictEqual(
    narrowMetadataObject.missingRequiredSlots,
    ['expectation_before', 'experience_after']
  );
  assert.strictEqual(narrowMetadataObject.slotState.object.value, '云南');

  const narrowAnswer = await evaluateInterventionCheck({
    intervention_type: 'NARROW_SCOPE',
    before_transcript: '嗯，我想一想。',
    after_transcript: '我原来以为会很甜，吃起来酸甜味很平衡。',
    anchor: '西湖醋鱼',
    phase: 'ANSWER_ORIGINAL',
    original_question: '最近有没有一个东西，实际体验比你原来想象中更好？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '围绕对象回答了原题',
    original_task_complete: true
  })));
  assert.strictEqual(narrowAnswer.originalTaskComplete, true);

  const incompleteQ01 = await evaluateInterventionCheck({
    intervention_type: 'ONE_DETAIL',
    before_transcript: '电瓶车吧，感觉挺好的。',
    after_transcript: '能去很多地方、节约时间、不晒太阳。',
    anchor: '挺好的',
    phase: 'COMPLETE_INTERVENTION',
    original_question: '最近有没有一个东西，实际体验比你原来想象中更好？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after']
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '补充了具体体验',
    original_task_complete: true
  })));
  assert.strictEqual(incompleteQ01.interventionPass, true);
  assert.strictEqual(incompleteQ01.originalTaskComplete, false);
  assert.deepStrictEqual(incompleteQ01.missingRequiredSlots, ['expectation_before']);

  const completeQ01 = await evaluateInterventionCheck({
    intervention_type: 'ONE_DETAIL',
    before_transcript: '电瓶车吧，感觉挺好的。能去很多地方、节约时间、不晒太阳。',
    after_transcript: '我原来以为它很难骑。',
    anchor: '挺好的',
    phase: 'COMPLETE_INTERVENTION',
    original_question: '最近有没有一个东西，实际体验比你原来想象中更好？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after']
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '补齐了原来的预期',
    original_task_complete: true
  })));
  assert.strictEqual(completeQ01.originalTaskComplete, true);
  assert.deepStrictEqual(completeQ01.missingRequiredSlots, []);

  const initialSlotState = {
    object: { filled: true, value: '小红书' },
    expectation_before: { filled: false, value: '' },
    experience_after: { filled: false, value: '' }
  };
  const contextualExperience = await evaluateInterventionCheck({
    intervention_type: 'NARROW_SCOPE',
    before_transcript: '嗯，我想一想。小红书。',
    after_transcript: '可以学到很多别人的经验。',
    anchor: '小红书',
    phase: 'ANSWER_ORIGINAL',
    original_question: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after'],
    slot_state: initialSlotState,
    target_slot: 'experience_after',
    current_prompt: '它实际体验起来，有哪一点比你原来想象中更好？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '回答了实际体验后的价值',
    slot_evidence: {
      target_slot: 'experience_after',
      filled: true,
      value: '可以学到很多别人的经验。',
      evidence: '可以学到很多别人的经验。'
    }
  })));
  assert.strictEqual(contextualExperience.slotState.experience_after.filled, true);
  assert.strictEqual(
    contextualExperience.slotState.experience_after.value,
    '可以学到很多别人的经验。'
  );
  assert.deepStrictEqual(contextualExperience.missingRequiredSlots, ['expectation_before']);
  assert.strictEqual(contextualExperience.originalTaskComplete, false);

  const contextualExpectation = await evaluateInterventionCheck({
    intervention_type: 'NARROW_SCOPE',
    before_transcript: '嗯，我想一想。小红书。可以学到很多别人的经验。',
    after_transcript: '原本以为它广告会很多。',
    anchor: '小红书',
    phase: 'ANSWER_ORIGINAL',
    original_question: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after'],
    slot_state: contextualExperience.slotState,
    target_slot: 'expectation_before',
    current_prompt: '你原来以为它会怎么样？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '回答了原来的预期',
    slot_evidence: {
      target_slot: 'expectation_before',
      filled: true,
      value: '认为广告很多',
      evidence: '原本以为它广告会很多。'
    }
  })));
  assert.strictEqual(contextualExpectation.slotState.expectation_before.filled, true);
  assert.strictEqual(contextualExpectation.slotState.experience_after.filled, true);
  assert.deepStrictEqual(contextualExpectation.missingRequiredSlots, []);
  assert.strictEqual(contextualExpectation.originalTaskComplete, true);
  assert.strictEqual(
    contextualExpectation.slotEvidence.evidence,
    '原本以为它广告会很多。'
  );

  const invalidExpectation = await evaluateInterventionCheck({
    intervention_type: 'NARROW_SCOPE',
    before_transcript: '嗯，我想一想。小红书。可以学到很多别人的经验。',
    after_transcript: '嗯，我不知道。',
    anchor: '小红书',
    phase: 'ANSWER_ORIGINAL',
    original_question: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after'],
    slot_state: contextualExperience.slotState,
    target_slot: 'expectation_before',
    current_prompt: '你原来以为它会怎么样？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '错误的宽松 PASS'
  })));
  assert.strictEqual(invalidExpectation.result, 'RETRY');
  assert.strictEqual(invalidExpectation.slotState.expectation_before.filled, false);
  assert.strictEqual(invalidExpectation.slotState.experience_after.filled, true);
  assert.deepStrictEqual(invalidExpectation.missingRequiredSlots, ['expectation_before']);

  const groundedBaseState = {
    object: { filled: true, value: '小红书' },
    expectation_before: { filled: true, value: '原本以为它广告会很多。' },
    experience_after: { filled: false, value: '' }
  };
  const brokenExperience = await evaluateInterventionCheck({
    intervention_type: 'ONE_DETAIL',
    before_transcript: '小红书吧。原本以为它广告会很多。',
    after_transcript: '但是发现其实还是有很多。别人的精英。',
    phase: 'COMPLETE_INTERVENTION',
    original_question: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after'],
    slot_state: groundedBaseState,
    target_slot: 'experience_after',
    current_prompt: '真正体验以后，哪一点和你原来想的不一样？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '发现广告其实还是很多',
    slot_evidence: {
      target_slot: 'experience_after',
      filled: true,
      value: '发现广告其实还是很多',
      evidence: '发现广告其实还是很多'
    }
  })));
  assert.strictEqual(brokenExperience.result, 'RETRY');
  assert.strictEqual(brokenExperience.interventionPass, false);
  assert.strictEqual(brokenExperience.slotState.experience_after.filled, false);
  assert.strictEqual(brokenExperience.originalTaskComplete, false);
  assert.ok(!brokenExperience.reason.includes('广告其实还是很多'));
  assert.ok(!brokenExperience.reason.includes('可以学到别人经验'));

  const groundedExperience = await evaluateInterventionCheck({
    intervention_type: 'ONE_DETAIL',
    before_transcript: '小红书吧。原本以为它广告会很多。',
    after_transcript: '后来发现评论区里其实有很多别人分享的真实经验。',
    phase: 'COMPLETE_INTERVENTION',
    original_question: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
    question_task_type: 'EXPERIENCE_COMPARE',
    question_required_slots: ['object', 'expectation_before', 'experience_after'],
    slot_state: groundedBaseState,
    target_slot: 'experience_after',
    current_prompt: '真正体验以后，哪一点和你原来想的不一样？'
  }, async () => response(JSON.stringify({
    result: 'PASS',
    reason: '实际体验后发现真实经验很多',
    slot_evidence: {
      target_slot: 'experience_after',
      filled: true,
      value: '发现评论区有很多真实经验',
      evidence: '后来发现评论区里其实有很多别人分享的真实经验。'
    }
  })));
  assert.strictEqual(groundedExperience.result, 'PASS');
  assert.strictEqual(groundedExperience.slotState.experience_after.filled, true);
  assert.strictEqual(groundedExperience.originalTaskComplete, true);
  assert.strictEqual(
    groundedExperience.slotState.experience_after.value,
    '后来发现评论区里其实有很多别人分享的真实经验。'
  );
  console.log('intervention-checker tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
