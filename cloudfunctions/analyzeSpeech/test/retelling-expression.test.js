'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const {
  analyzeRetellingExpression,
  hasStrongBreakdownEvidence
} = require('../lib/retelling-expression-analyzer');
const { composeRetellingV056Evaluation } = require('../lib/retelling-dual-evaluator');
const { routeRetellingTrainingV056 } = require('../lib/retelling-training-router');
const { RETELLING_EXPRESSION_SYSTEM_PROMPT } = require('../config/retelling-expression-prompt');

function material(id) {
  return materialPayload(materials.find((item) => item.id === id));
}

function passTask(transcript, order = ['K2', 'K3']) {
  const points = ['K1', 'K2', 'K3', 'K4', 'K5'].map((id) => {
    const orderIndex = order.indexOf(id);
    return {
      id,
      covered: orderIndex >= 0,
      evidence: orderIndex >= 0 ? transcript : '',
      start: orderIndex >= 0 ? orderIndex : -1,
      end: orderIndex >= 0 ? transcript.length : -1
    };
  });
  return {
    taskStatus: 'PASS',
    coreMeaningClear: true,
    coreFactsComplete: true,
    missingCorePointIds: [],
    requiresNewContent: false,
    keyPoints: points,
    relations: [{ id: 'R1', status: 'MISSING' }, {
      id: 'R2',
      status: 'CORRECT',
      fromEvidence: transcript,
      toEvidence: transcript,
      relationEvidence: transcript,
      fromSpan: { text: transcript, start: 0, end: transcript.length },
      toSpan: { text: transcript, start: 0, end: transcript.length },
      relationSpan: { text: transcript, start: 0, end: transcript.length }
    }],
    incorrectClaims: []
  };
}

function rawExpression(issue, userEvidence, materialEvidence, ids, confidence = 'HIGH', reason = '') {
  return { expression_diagnosis: {
    issue,
    reason_code: reason,
    user_evidence: userEvidence,
    material_evidence: materialEvidence,
    related_key_point_ids: ids,
    confidence
  } };
}

const fixtures = [
  {
    id: 'A',
    materialId: 'retelling_001',
    transcript: '嗯，人在吃辣椒的时候会觉得很烫，是因为辣椒素刺激了人体的某个感受器。嗯，这个感受器平时就是控制。呃呃呃，控制温度的所以。它向大脑皮层传递的。呃，信息就是烫的信息，所以就会觉得吃辣椒很。有一种灼烧感。',
    raw: rawExpression('WORDING_PRECISION', '控制温度的', '感受器也参与对高温和灼热刺激的感知', ['K2']),
    expected: 'WORDING_PRECISION'
  },
  {
    id: 'B',
    materialId: 'retelling_002',
    transcript: '呃。嗯，一块木头和一块金属在同一个房间，他们的温度可能是一样的。但是，由于人体的温度更高，在接触的时候金属导热更快，那么人体的降温就会更快。所以就会觉得呃，金属会摸起来更冷一点。',
    raw: rawExpression('NONE', '', '', []),
    expected: 'NONE',
    order: ['K4', 'K1', 'K2', 'K3']
  },
  {
    id: 'C',
    materialId: 'retelling_003',
    transcript: '呃，为什么录音的时候听起来声音会比较陌生？是因为呃录音我们平常说话的时候，声音是既通过空气传导进入耳朵，也同时通过骨骼传导进入内耳。所以说，它是由骨传导和空气传导的。但是录音的时候，只有空气传导的声音进入耳朵。所以他们两者的性质比较不一样。所以导致。听到的声音。录音你的声音会比较陌生。',
    raw: rawExpression('FORMULATION_BREAKDOWN', '所以导致。听到的声音。录音你的声音会比较陌生。', '', ['K3'], 'HIGH', 'CLAUSE_FORMATION_INTERRUPTED'),
    expected: 'FORMULATION_BREAKDOWN'
  },
  {
    id: 'D',
    materialId: 'retelling_004',
    transcript: '呃，我们吃东西的时候，其实大部分的感受还是来自于鼻腔的。呃，鼻腔的感官，感官系统，所以说，呃。当捏住鼻子的时候，虽然舌头能够尝到基本的酸甜苦辣咸，但是呢，气味还是无法达到鼻腔的感受系统。所以，呃，吃东西的时候就是。捏着鼻子就会觉得没有味道。',
    raw: rawExpression('NONE', '', '', []),
    expected: 'NONE',
    order: ['K4', 'K2', 'K3']
  },
  {
    id: 'E',
    materialId: 'retelling_006',
    transcript: '空气中的土味是因为土壤里面本来就有一些特殊气味的物质，比如说土臭素。当下雨的时候，雨滴落到干燥多孔的地面的时候，会呃在地面形成一些空气泡。这些空气泡升到空中并。炸裂开，将气的这些气味释放到气溶胶中，再伴随空气进入我们的鼻腔，所以就会闻到一些空气里的土味。',
    raw: rawExpression('NONE', '', '', []),
    expected: 'NONE',
    order: ['K4', 'K1', 'K2', 'K3']
  },
  {
    id: 'F',
    materialId: 'retelling_005',
    transcript: '嗯，微波进入食物的时候，会通过水、脂肪等物质分解释放能量。但是呢，食物的每一个。部分，每一块它们的成分厚度不相同，所以在短时间加热的时候，微波释放的能释放的热量的速度不同。嗯，所以会造成这一块。一块烫一块冷的情况。',
    raw: rawExpression('NONE', '', '', []),
    expected: 'NONE'
  }
];

fixtures.forEach((fixture) => {
  const input = { material: material(fixture.materialId), transcript: fixture.transcript };
  const task = passTask(fixture.transcript, fixture.order);
  const result = composeRetellingV056Evaluation(input, task, fixture.raw);
  assert.strictEqual(result.taskResult.taskStatus, 'PASS', `${fixture.id} task remains PASS`);
  assert.strictEqual(result.processResult.expressionIssue, fixture.expected, `${fixture.id} expression`);
  assert.strictEqual(result.processResult.processIssue, 'NONE', `${fixture.id} production order disabled`);
  assert.notStrictEqual(result.routedResult.primaryTrainingNeed, 'INFORMATION_ORDER', `${fixture.id} no order route`);
  const expectedRoute = fixture.expected === 'NONE' ? 'PASS' : fixture.expected;
  assert.strictEqual(result.routedResult.primaryTrainingNeed, expectedRoute, `${fixture.id} route`);
});

assert.strictEqual(hasStrongBreakdownEvidence('一次嗯，句子最后仍然完整。'), false);
assert.strictEqual(hasStrongBreakdownEvidence('所以导致。听到的声音还要重新拼接。'), true);

const fluentWithFiller = '呃，我想了一下，辣椒素激活感受器，所以嘴里会觉得很烫。';
const fillerCandidate = analyzeRetellingExpression({
  material: material('retelling_001'),
  transcript: fluentWithFiller,
  taskResult: passTask(fluentWithFiller),
  rawEvaluation: rawExpression(
    'FORMULATION_BREAKDOWN',
    fluentWithFiller,
    '',
    ['K2', 'K3'],
    'HIGH',
    'CLAUSE_FORMATION_INTERRUPTED'
  )
});
assert.strictEqual(fillerCandidate.expressionIssue, 'NONE', 'filler alone cannot trigger breakdown');

const pepper = material('retelling_001');
const invalidMaterialEvidence = analyzeRetellingExpression({
  material: pepper,
  transcript: fixtures[0].transcript,
  taskResult: passTask(fixtures[0].transcript),
  rawEvaluation: rawExpression('WORDING_PRECISION', '控制温度的', '模型自己生成的标准答案', ['K2'])
});
assert.strictEqual(invalidMaterialEvidence.expressionIssue, 'FORMULATION_BREAKDOWN');

const quietTranscript = '这个感受器会让人产生灼热感觉。';
const ungroundedWithoutBreakdown = analyzeRetellingExpression({
  material: pepper,
  transcript: quietTranscript,
  taskResult: passTask(quietTranscript),
  rawEvaluation: rawExpression('WORDING_PRECISION', '这个感受器', '模型自己生成的标准答案', ['K2'])
});
assert.strictEqual(ungroundedWithoutBreakdown.expressionIssue, 'NONE');

const lexicalTranscript = '这个感受器那个词怎么说，我一下想不起来。';
const lexical = analyzeRetellingExpression({
  material: pepper,
  transcript: lexicalTranscript,
  taskResult: passTask(lexicalTranscript),
  rawEvaluation: rawExpression('NONE', '', '', [])
});
assert.strictEqual(lexical.expressionIssue, 'FORMULATION_BREAKDOWN');
assert.strictEqual(lexical.reasonCode, 'WORD_SEARCH_INTERRUPTION');

const taskPriority = routeRetellingTrainingV056(
  Object.assign({}, passTask('内容。'), { taskStatus: 'MISSING_CORE_CONTENT' }),
  fixtures[0].raw.expression_diagnosis
);
assert.strictEqual(taskPriority.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');

assert.ok(RETELLING_EXPRESSION_SYSTEM_PROMPT.includes('expression_diagnosis'));
assert.ok(RETELLING_EXPRESSION_SYSTEM_PROMPT.includes('不要分析信息排列顺序'));
console.log('retelling expression tests passed (real-device A-F)');
