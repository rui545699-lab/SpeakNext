'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const { evaluateRetellingDualV056 } = require('../lib/retelling-dual-evaluator');

const material = materialPayload(materials.find((item) => item.id === 'retelling_001'));
const transcript = '辣椒素激活感受器，控制温度的，所以会有灼热感。';
const raw = {
  key_points: [
    { id: 'K2', covered: true, evidence: '辣椒素激活感受器' },
    { id: 'K3', covered: true, evidence: '会有灼热感' }
  ],
  relations: [{
    id: 'R2',
    status: 'CORRECT',
    from_evidence: '辣椒素激活感受器',
    to_evidence: '会有灼热感',
    relation_evidence: transcript
  }],
  incorrect_claims: [],
  expression_diagnosis: {
    issue: 'WORDING_PRECISION',
    reason_code: 'MEANING_SHIFT_IN_WORDING',
    user_evidence: '控制温度的',
    material_evidence: '感受器也参与对高温和灼热刺激的感知',
    related_key_point_ids: ['K2'],
    confidence: 'HIGH'
  }
};

let calls = 0;
evaluateRetellingDualV056({ material, transcript }, async (payload) => {
  calls += 1;
  assert.ok(payload.messages[0].content.includes('expression_diagnosis'));
  return {
    id: 'expression-evaluator-test',
    model: 'deepseek-flash',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }]
  };
}).then((result) => {
  assert.strictEqual(calls, 1, 'V0.5.6 keeps one content/expression request');
  assert.strictEqual(result.taskResult.taskStatus, 'PASS');
  assert.strictEqual(result.processResult.expressionIssue, 'WORDING_PRECISION');
  assert.strictEqual(result.processResult.processIssue, 'NONE');
  assert.strictEqual(result.routedResult.primaryTrainingNeed, 'WORDING_PRECISION');
  assert.strictEqual(result.requestId, 'expression-evaluator-test');
  console.log('retelling expression evaluator tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
