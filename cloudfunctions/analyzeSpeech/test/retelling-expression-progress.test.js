'use strict';

const assert = require('assert');
const { resolveRetellingProgress } = require('../lib/retelling-progress-resolver');

function point(id, covered, evidence) {
  return {
    id,
    covered,
    evidence: covered ? evidence : '',
    start: covered ? 0 : -1,
    end: covered ? evidence.length : -1
  };
}

function round(issue, ids, options = {}) {
  const transcript = options.transcript || '相关核心内容已经完整保留。';
  const coveredIds = options.coveredIds || ['K2', 'K3'];
  return {
    transcript,
    taskResult: {
      taskStatus: options.taskStatus || 'PASS',
      keyPoints: ['K1', 'K2', 'K3', 'K4', 'K5'].map((id) => point(id, coveredIds.includes(id), transcript)),
      relations: [],
      incorrectClaims: [],
      coreFactsComplete: coveredIds.includes('K2') && coveredIds.includes('K3')
    },
    processResult: {
      processIssue: 'NONE',
      expressionIssue: issue,
      reasonCode: issue === 'NONE' ? 'EXPRESSION_NONE' : 'FIXTURE_ISSUE',
      userEvidence: issue === 'NONE' ? null : { text: transcript, start: 0, end: transcript.length },
      materialEvidence: null,
      relatedKeyPointIds: ids,
      targetRetryEvaluation: options.targetRetained === undefined ? null : {
        applicable: true,
        targetRetained: options.targetRetained,
        targetEvidence: { text: transcript, start: 0, end: transcript.length },
        meaningChanged: false,
        reasonCode: 'TEST_RETENTION'
      }
    },
    routedResult: { primaryTrainingNeed: issue === 'NONE' ? 'PASS' : issue, evidence: [] }
  };
}

function resolve(need, first, second) {
  return resolveRetellingProgress({ originalTrainingNeed: need, firstRoundResult: first, secondRoundResult: second });
}

let result = resolve('WORDING_PRECISION', round('WORDING_PRECISION', ['K2']), round('NONE', []));
assert.strictEqual(result.resolved, true);
assert.strictEqual(result.improvementType, 'WORDING_REFINED');
assert.strictEqual(result.reasonCode, 'WORDING_REFINED');

result = resolve('WORDING_PRECISION', round('WORDING_PRECISION', ['K2']), round('WORDING_PRECISION', ['K2']));
assert.strictEqual(result.resolved, false);
assert.strictEqual(result.reasonCode, 'WORDING_PRECISION_STILL_PRESENT');

result = resolve('WORDING_PRECISION', round('WORDING_PRECISION', ['K2']), round('NONE', [], {
  coveredIds: ['K3'], targetRetained: false
}));
assert.strictEqual(result.resolved, false);
assert.strictEqual(result.reasonCode, 'TARGET_CONTENT_REMOVED');

result = resolve('WORDING_PRECISION', round('WORDING_PRECISION', ['K2']), round('NONE', [], { taskStatus: 'UNCERTAIN' }));
assert.strictEqual(result.resolved, true, 'targeted retry may be locally resolved even when the partial Task is UNCERTAIN');
assert.strictEqual(result.reasonCode, 'WORDING_REFINED');

result = resolve('FORMULATION_BREAKDOWN', round('FORMULATION_BREAKDOWN', ['K3']), round('NONE', []));
assert.strictEqual(result.resolved, true);
assert.strictEqual(result.improvementType, 'FORMULATION_COMPLETED');

result = resolve('FORMULATION_BREAKDOWN', round('FORMULATION_BREAKDOWN', ['K3']), round('FORMULATION_BREAKDOWN', ['K3']));
assert.strictEqual(result.resolved, false);
assert.strictEqual(result.reasonCode, 'FORMULATION_BREAKDOWN_STILL_PRESENT');

result = resolve('FORMULATION_BREAKDOWN', round('FORMULATION_BREAKDOWN', ['K3']), round('WORDING_PRECISION', ['K2']));
assert.strictEqual(result.resolved, true, 'new issue on another key point does not replace original target');

console.log('retelling expression progress tests passed');
