const assert = require('assert');
const material = require('../../../eval/retelling-cases')[0].material;
const { evaluateRetellingDual } = require('../lib/retelling-dual-evaluator');

function response(value) {
  return {
    id: 'dual-test',
    model: 'deepseek-flash',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }]
  };
}

const transcript = '重要消息会被漏，然后人不看通知，然后通知很多，就是普通提醒太多，最后大家就会忽略。';
const raw = {
  key_points: [
    { id: 'K1', covered: true, evidence: '通知很多' },
    { id: 'K2', covered: true, evidence: '人不看通知' },
    { id: 'K3', covered: true, evidence: '重要消息会被漏' }
  ],
  relations: [{
    id: 'R2', status: 'MISSING', from_evidence: '人不看通知', to_evidence: '重要消息会被漏', relation_evidence: ''
  }],
  incorrect_claims: []
};

evaluateRetellingDual({ material, transcript }, async () => response(raw))
  .then((result) => {
    assert.strictEqual(result.taskResult.taskStatus, 'RELATION_NOT_ESTABLISHED');
    assert.strictEqual(result.processResult.processIssue, 'INFORMATION_ORDER');
    assert.strictEqual(result.routedResult.primaryTrainingNeed, 'INFORMATION_ORDER');
    assert.ok(result.rawContentEvaluation);
    assert.strictEqual(result.requestId, 'dual-test');
    console.log('retelling dual evaluator tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
