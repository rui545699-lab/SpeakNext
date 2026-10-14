const assert = require('assert');
const cases = require('../../../eval/retelling-cases');
const {
  evaluateRetelling,
  findRelationConsistencyIssues,
  createRelationRepairPayload
} = require('../lib/retelling-evaluator');
const {
  RETELLING_RELATION_REPAIR_SYSTEM_PROMPT
} = require('../config/retelling-evaluator-prompt');

const material = cases[0].material;

function response(value, id) {
  return {
    id,
    model: 'deepseek-flash',
    choices: [{
      finish_reason: 'stop',
      message: { content: JSON.stringify(value) }
    }]
  };
}

function baseEvaluation(primaryNeed, r2) {
  return {
    core_meaning_clear: false,
    key_points: [],
    relations: [r2],
    incorrect_claims: [],
    primary_training_need: primaryNeed,
    recommended_action: primaryNeed === 'INCORRECT_RELATION'
      ? 'RETHINK_RELATION'
      : 'OBSERVE_AGAIN',
    evidence: [],
    reason: 'fixture'
  };
}

function relation(status, fromEvidence = '', toEvidence = '', relationEvidence = '') {
  return {
    id: 'R2',
    status,
    from_evidence: fromEvidence,
    to_evidence: toEvidence,
    relation_evidence: relationEvidence
  };
}

async function runSequence(transcript, initial, repaired) {
  let calls = 0;
  const result = await evaluateRetelling({ material, transcript }, async () => {
    calls += 1;
    return response(calls === 1 ? initial : repaired, `request-${calls}`);
  });
  return { calls, result };
}

async function main() {
  const missingTranscript = '重要消息容易漏掉。';
  const adversarialMissing = baseEvaluation(
    'INCORRECT_RELATION',
    relation('MISSING', '', '重要消息容易漏掉', '')
  );
  const repairedAsMissing = await runSequence(missingTranscript, adversarialMissing, {
    relations: [relation('MISSING', '', '重要消息容易漏掉', '')]
  });
  assert.strictEqual(repairedAsMissing.calls, 2);
  assert.strictEqual(repairedAsMissing.result.relationRepairRemainingIssues.length, 0);
  assert.strictEqual(repairedAsMissing.result.evaluation.primary_training_need, 'MISSING_CAUSAL_STEP');
  assert.notStrictEqual(repairedAsMissing.result.evaluation.primary_training_need, 'INCORRECT_RELATION');

  const correctTranscript = '人习惯忽略提醒，所以重要消息容易漏掉。';
  const adversarialCorrect = baseEvaluation(
    'INCORRECT_RELATION',
    relation('MISSING')
  );
  adversarialCorrect.key_points = [
    { id: 'K2', covered: true, evidence: '人习惯忽略提醒' },
    { id: 'K3', covered: true, evidence: '重要消息容易漏掉' }
  ];
  const repairedAsCorrect = await runSequence(correctTranscript, adversarialCorrect, {
    relations: [relation(
      'CORRECT',
      '人习惯忽略提醒',
      '重要消息容易漏掉',
      correctTranscript
    )]
  });
  assert.strictEqual(repairedAsCorrect.calls, 2);
  assert.strictEqual(repairedAsCorrect.result.relationRepairRemainingIssues.length, 0);
  assert.strictEqual(repairedAsCorrect.result.evaluation.primary_training_need, null);
  assert.strictEqual(repairedAsCorrect.result.evaluation.recommended_action, 'PASS');

  const l07Transcript = '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。';
  const l07Incomplete = baseEvaluation(
    'INCORRECT_RELATION',
    relation('INCORRECT', '', '', l07Transcript)
  );
  const l07Repair = {
    relations: [relation(
      'INCORRECT',
      '人后来才开始忽略普通通知',
      '重要消息经常被漏掉',
      l07Transcript
    )]
  };
  const repairedL07 = await runSequence(l07Transcript, l07Incomplete, l07Repair);
  assert.strictEqual(repairedL07.calls, 2);
  assert.strictEqual(repairedL07.result.relationRepairCount, 1);
  assert.strictEqual(repairedL07.result.evaluation.primary_training_need, 'INCORRECT_RELATION');
  assert.strictEqual(repairedL07.result.evaluation.relations[1].status, 'INCORRECT');

  const auditPayload = createRelationRepairPayload(
    'deepseek-flash',
    { material, transcript: missingTranscript },
    adversarialMissing,
    ['PRIMARY_NEED_R2_STATUS_MISMATCH']
  );
  const repairUserContent = auditPayload.messages[1].content;
  assert.strictEqual(repairUserContent.includes('primary_training_need'), false);
  assert.strictEqual(repairUserContent.includes('INCORRECT_RELATION'), false);
  assert.strictEqual(repairUserContent.includes('PRIMARY_NEED_R2_STATUS_MISMATCH'), false);
  assert.strictEqual(repairUserContent.includes('R2_STATUS_REVIEW_REQUIRED'), true);
  assert.strictEqual(RETELLING_RELATION_REPAIR_SYSTEM_PROMPT.includes('与原始 primary need 保持一致'), false);
  assert.strictEqual(RETELLING_RELATION_REPAIR_SYSTEM_PROMPT.includes('独立决定'), true);

  const failedRepair = await runSequence(l07Transcript, l07Incomplete, {
    relations: [relation('INCORRECT', '', '', l07Transcript)]
  });
  assert.strictEqual(failedRepair.calls, 2);
  assert.strictEqual(failedRepair.result.relationRepairCount, 1);
  assert.ok(failedRepair.result.relationRepairRemainingIssues.length > 0);
  assert.notStrictEqual(failedRepair.result.evaluation.primary_training_need, 'INCORRECT_RELATION');

  const l08Transcript = '通知越多，人越会认真查看提醒，所以真正重要的信息反而更容易被发现。';
  const l08Mismatch = baseEvaluation(
    'INCORRECT_RELATION',
    relation('MISSING')
  );
  assert.deepStrictEqual(
    findRelationConsistencyIssues(l08Mismatch),
    ['PRIMARY_NEED_R2_STATUS_MISMATCH']
  );
  const repairedL08 = await runSequence(l08Transcript, l08Mismatch, {
    primary_training_need: 'UNCERTAIN',
    key_points: [{ id: 'K2', covered: true, evidence: '不应被合并' }],
    relations: [relation(
      'INCORRECT',
      '人越会认真查看提醒',
      '真正重要的信息反而更容易被发现',
      '人越会认真查看提醒，所以真正重要的信息反而更容易被发现'
    )]
  });
  assert.strictEqual(repairedL08.calls, 2);
  assert.strictEqual(repairedL08.result.repairedEvaluation.primary_training_need, 'INCORRECT_RELATION');
  assert.deepStrictEqual(repairedL08.result.repairedEvaluation.key_points, []);
  assert.strictEqual(repairedL08.result.evaluation.primary_training_need, 'INCORRECT_RELATION');
  assert.strictEqual(repairedL08.result.evaluation.relations[1].from_evidence, '人越会认真查看提醒');
  assert.strictEqual(repairedL08.result.evaluation.relations[1].to_evidence, '真正重要的信息反而更容易被发现');

  const ungroundedRepair = await runSequence(l07Transcript, l07Incomplete, {
    relations: [relation(
      'INCORRECT',
      '用户忽略通知',
      '重要信息被错过',
      '用户忽略通知导致重要信息被错过'
    )]
  });
  assert.strictEqual(ungroundedRepair.calls, 2);
  assert.strictEqual(ungroundedRepair.result.evaluation.relations[1].status, 'UNSUPPORTED');
  assert.notStrictEqual(ungroundedRepair.result.evaluation.primary_training_need, 'INCORRECT_RELATION');

  const unaffected = [
    baseEvaluation(null, relation('CORRECT', '人不看提醒', '重要消息漏掉', '人不看提醒，所以重要消息漏掉')),
    baseEvaluation('MISSING_CAUSAL_STEP', relation('MISSING', '', '重要消息漏掉', '')),
    baseEvaluation('LEXICAL_RETRIEVAL', relation('MISSING')),
    baseEvaluation('UNCERTAIN', relation('UNSUPPORTED'))
  ];
  unaffected.forEach((item) => assert.deepStrictEqual(findRelationConsistencyIssues(item), []));

  let unaffectedCalls = 0;
  const unaffectedResult = await evaluateRetelling({
    material,
    transcript: '通知很多，所以重要消息漏掉。'
  }, async () => {
    unaffectedCalls += 1;
    return response(unaffected[1], 'unaffected');
  });
  assert.strictEqual(unaffectedCalls, 1);
  assert.strictEqual(unaffectedResult.relationRepairCount, 0);
  assert.strictEqual(unaffectedResult.evaluation.primary_training_need, 'MISSING_CAUSAL_STEP');

  console.log('retelling relation repair tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
