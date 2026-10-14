'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const { evaluateRetellingDualV057 } = require('../lib/retelling-dual-evaluator');

const material = materialPayload(materials.find((item) => item.id === 'retelling_001'));
const transcript = '这个感受器负责控制人体温度，所以人会觉得灼热';
const evaluation = {
  key_points: material.key_points.map((point) => ({
    id: point.id,
    covered: point.id === 'K2' || point.id === 'K3',
    evidence: point.id === 'K2'
      ? '这个感受器负责控制人体温度'
      : point.id === 'K3' ? '所以人会觉得灼热' : ''
  })),
  relations: material.relations.map((relation) => relation.id === 'R2' ? {
    id: 'R2', status: 'CORRECT', from_evidence: '这个感受器负责控制人体温度',
    to_evidence: '所以人会觉得灼热', relation_evidence: transcript
  } : { id: relation.id, status: 'MISSING', from_evidence: '', to_evidence: '', relation_evidence: '' }),
  incorrect_claims: [],
  concept_inaccuracy: {
    detected: true,
    user_evidence: '负责控制人体温度',
    material_evidence: '感受器也参与对高温和灼热刺激的感知',
    related_key_point_ids: ['K2'],
    reason_code: 'FUNCTION_CHANGED',
    confidence: 'HIGH'
  },
  expression_diagnosis: {
    issue: 'NONE', reason_code: 'EXPRESSION_NONE', user_evidence: '', material_evidence: '',
    related_key_point_ids: [], confidence: 'LOW'
  }
};

let calls = 0;
evaluateRetellingDualV057({ material, transcript }, async (payload) => {
  calls += 1;
  assert.ok(payload.messages[0].content.includes('concept_inaccuracy'));
  assert.ok(payload.messages[0].content.includes('expression_diagnosis'));
  return {
    model: 'mock-deepseek',
    requestId: 'concept-request',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(evaluation) } }]
  };
}).then((result) => {
  assert.strictEqual(calls, 1, 'Content and Expression must share one request');
  assert.strictEqual(result.taskResult.taskStatus, 'CONCEPT_INACCURACY');
  assert.strictEqual(result.routedResult.primaryTrainingNeed, 'CONCEPT_INACCURACY');
  assert.strictEqual(result.routedResult.recommendedAction, 'CORRECT_CONCEPT');
  assert.strictEqual(result.promptVersion, 'retelling-missing-target-alignment-v0.5.10.2');
  console.log('retelling concept evaluator tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
