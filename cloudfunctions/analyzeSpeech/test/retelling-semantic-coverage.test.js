'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const legacyMaterial = require('../../../eval/fixtures/retelling-001-notification-legacy');
const { materialPayload } = require('../../../utils/retelling-service');
const { validateRetellingEvaluationEvent } = require('../lib/validation');
const {
  createRetellingContentPayload,
  validateRetellingContent
} = require('../lib/retelling-content-evaluator');
const { RETELLING_CONTENT_SYSTEM_PROMPT } = require('../config/retelling-content-prompt');

const resultOnlyCases = [
  ['retelling_001', '辣椒本身其实没那么烫，但是吃起来嘴里还是会觉得特别热。', '嘴里还是会觉得特别热'],
  ['retelling_002', '金属和木头温度差不多，但摸金属的时候明显觉得更冷。', '摸金属的时候明显觉得更冷'],
  ['retelling_003', '录音里的声音明明是自己的，但是听起来和平时感觉不太一样。', '听起来和平时感觉不太一样'],
  ['retelling_004', '捏住鼻子以后，食物还是能尝出甜咸，但整体味道淡了很多。', '整体味道淡了很多'],
  ['retelling_005', '微波炉热饭的时候，经常会有些地方特别热，有些地方还是冷的。', '有些地方特别热，有些地方还是冷的'],
  ['retelling_006', '下完一点小雨以后，空气里经常会有一种很明显的泥土味。', '空气里经常会有一种很明显的泥土味']
];

resultOnlyCases.forEach(([id, transcript, evidence]) => {
  const material = materialPayload(materials.find((item) => item.id === id));
  const result = validateRetellingContent({
    key_points: [{ id: 'K3', covered: true, evidence }],
    relations: [{ id: 'R2', status: 'MISSING', from_evidence: '', to_evidence: evidence, relation_evidence: '' }],
    incorrect_claims: []
  }, { material, transcript });
  assert.strictEqual(result.keyPoints.find((point) => point.id === 'K3').covered, true, `${id} K3`);
  assert.strictEqual(result.keyPoints.find((point) => point.id === 'K2').covered, false, `${id} K2`);
  assert.strictEqual(result.taskStatus, 'MISSING_CORE_CONTENT', `${id} partial task`);
});

const negativeTranscripts = [
  ['retelling_001', '这个挺神奇的。'],
  ['retelling_002', '金属这个话题挺有意思。'],
  ['retelling_003', '我平时也会录音。'],
  ['retelling_004', '我喜欢吃东西。'],
  ['retelling_005', '微波炉挺方便的。'],
  ['retelling_006', '我挺喜欢下雨天。']
];

negativeTranscripts.forEach(([id, transcript]) => {
  const source = materials.find((item) => item.id === id);
  const material = materialPayload(source);
  const anchor = source.keyPoints.find((point) => point.id === 'K3').semanticAnchors[0];
  const result = validateRetellingContent({
    key_points: [{ id: 'K3', covered: true, evidence: anchor }],
    relations: [{ id: 'R2', status: 'MISSING', from_evidence: '', to_evidence: anchor, relation_evidence: '' }],
    incorrect_claims: []
  }, { material, transcript });
  assert.strictEqual(result.keyPoints.find((point) => point.id === 'K3').covered, false,
    `${id} anchor cannot replace transcript evidence`);
  assert.strictEqual(result.taskStatus, 'UNCERTAIN', `${id} negative control`);
});

materials.forEach((source) => {
  const validated = validateRetellingEvaluationEvent({
    material: materialPayload(source),
    transcript: '测试表达。'
  });
  assert.ok(validated.material.key_points.find((point) => point.id === 'K3').semantic_anchors.length);
});
assert.strictEqual(validateRetellingEvaluationEvent({
  material: {
    id: legacyMaterial.id,
    title: legacyMaterial.title,
    core_message: legacyMaterial.coreMessage,
    key_points: legacyMaterial.keyPoints,
    relations: legacyMaterial.relations
  },
  transcript: '历史材料。'
}).material.key_points.some((point) => point.semantic_anchors), false,
'semantic anchors remain optional');

const sampleInput = { material: materialPayload(materials[0]), transcript: resultOnlyCases[0][1] };
const payload = createRetellingContentPayload('deepseek-flash', sampleInput);
assert.ok(payload.messages[1].content.includes('semantic_anchors'));
assert.ok(RETELLING_CONTENT_SYSTEM_PROMPT.includes('非穷举提示'));
assert.ok(RETELLING_CONTENT_SYSTEM_PROMPT.includes('绝不能直接复制为 evidence'));

console.log('retelling semantic coverage tests passed (6 partial + 6 negative)');
