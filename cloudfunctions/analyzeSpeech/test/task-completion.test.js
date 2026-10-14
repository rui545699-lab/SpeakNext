const assert = require('assert');
const { assessTaskCompletion } = require('../lib/task-completion');
const { validateEvent } = require('../lib/validation');

const validatedEvent = validateEvent({
  fileID: 'cloud://audio.mp3',
  question_id: 'q01',
  question_text: '最近有没有一个东西，实际体验比你原来想象中更好？',
  question_category: 'GENERAL_EXPERIENCE',
  question_openness: 'HIGH',
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after'],
  session_id: 'session_1',
  round_id: 'round_1'
});
assert.strictEqual(validatedEvent.questionTaskType, 'EXPERIENCE_COMPARE');
assert.deepStrictEqual(
  validatedEvent.questionRequiredSlots,
  ['object', 'expectation_before', 'experience_after']
);

const complete = assessTaskCompletion({
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after'],
  transcript: '电瓶车。我原来觉得骑起来很难，实际骑了以后发现挺方便。'
});
assert.strictEqual(complete.supported, true);
assert.strictEqual(complete.complete, true);
assert.deepStrictEqual(complete.slots, {
  object: true,
  expectation_before: true,
  experience_after: true
});

const incomplete = assessTaskCompletion({
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after'],
  transcript: '电瓶车，挺方便的。'
});
assert.strictEqual(incomplete.complete, false);
assert.strictEqual(incomplete.slots.object, true);
assert.strictEqual(incomplete.slots.expectation_before, false);
assert.strictEqual(incomplete.slots.experience_after, true);
assert.deepStrictEqual(incomplete.missingSlots, ['expectation_before']);

const stillMissingExpectation = assessTaskCompletion({
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after'],
  transcript: '电瓶车吧，感觉挺好的。能去很多地方、节约时间、不晒太阳。'
});
assert.strictEqual(stillMissingExpectation.complete, false);
assert.deepStrictEqual(stillMissingExpectation.missingSlots, ['expectation_before']);

const namedDish = assessTaskCompletion({
  question_task_type: 'EXPERIENCE_COMPARE',
  question_required_slots: ['object', 'expectation_before', 'experience_after'],
  transcript: '西湖醋鱼。我原来以为会很甜，实际吃起来酸甜味很平衡。'
});
assert.strictEqual(namedDish.complete, true);

const unsupported = assessTaskCompletion({
  question_task_type: 'REASON',
  question_required_slots: ['reason'],
  transcript: '因为挺好的。'
});
assert.strictEqual(unsupported.supported, false);

const reasonExplain = assessTaskCompletion({
  question_task_type: 'REASON_EXPLAIN',
  question_required_slots: ['object', 'attitude', 'reason'],
  transcript: '那家餐厅我愿意再去，因为服务很快，味道也不错。'
});
assert.strictEqual(reasonExplain.complete, true);

const genericReason = assessTaskCompletion({
  question_task_type: 'REASON_EXPLAIN',
  question_required_slots: ['object', 'attitude', 'reason'],
  transcript: '这个地方我喜欢，因为挺好的。'
});
assert.strictEqual(genericReason.complete, false);
assert.deepStrictEqual(genericReason.missingSlots, ['reason']);

const opinionDifference = assessTaskCompletion({
  question_task_type: 'OPINION_DIFFERENCE',
  question_required_slots: ['topic', 'my_view', 'other_view', 'difference'],
  transcript: '朋友觉得那部电影节奏很好，但是我觉得太慢了，我们评价不一样。'
});
assert.strictEqual(opinionDifference.complete, true);

const simpleExperience = assessTaskCompletion({
  question_task_type: 'SIMPLE_EXPERIENCE',
  question_required_slots: ['event', 'key_detail', 'result_or_feeling'],
  transcript: '昨天我坐地铁时坐过站了，当时又折返回去，最后迟到了十分钟，感觉挺麻烦。'
});
assert.strictEqual(simpleExperience.complete, true);

const choiceReason = assessTaskCompletion({
  question_task_type: 'CHOICE_REASON',
  question_required_slots: ['choice', 'reason'],
  question_text: '短距离出门，你更愿意走路还是骑车？为什么？',
  transcript: '我更愿意骑车，因为比较省时间。'
});
assert.strictEqual(choiceReason.complete, true);

console.log('task-completion tests passed');
