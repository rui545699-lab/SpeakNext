'use strict';

const assert = require('assert');
const { routeRetellingTrainingV056 } = require('../lib/retelling-training-router');

function task(taskStatus) {
  return {
    taskStatus,
    relations: taskStatus === 'INCORRECT_RELATION'
      ? [{ id: 'R2', status: 'INCORRECT', relationEvidence: '错误因果' }]
      : []
  };
}

function process(expressionIssue) {
  return {
    processIssue: 'NONE',
    expressionIssue,
    userEvidence: expressionIssue === 'NONE' ? null : { text: '用户原话', start: 0, end: 4 },
    materialEvidence: expressionIssue === 'WORDING_PRECISION'
      ? { text: '材料原意', start: 0, end: 4, field: 'key_points.K2' }
      : null,
    relatedKeyPointIds: expressionIssue === 'NONE' ? [] : ['K2']
  };
}

let routed = routeRetellingTrainingV056(task('INCORRECT_RELATION'), process('WORDING_PRECISION'));
assert.strictEqual(routed.primaryTrainingNeed, 'INCORRECT_RELATION');

routed = routeRetellingTrainingV056(task('MISSING_CORE_CONTENT'), process('WORDING_PRECISION'));
assert.strictEqual(routed.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');

routed = routeRetellingTrainingV056(task('RELATION_NOT_ESTABLISHED'), process('FORMULATION_BREAKDOWN'));
assert.strictEqual(routed.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');

routed = routeRetellingTrainingV056(task('UNCERTAIN'), process('WORDING_PRECISION'));
assert.strictEqual(routed.primaryTrainingNeed, 'UNCERTAIN');

routed = routeRetellingTrainingV056(task('PASS'), process('WORDING_PRECISION'));
assert.strictEqual(routed.primaryTrainingNeed, 'WORDING_PRECISION');
assert.strictEqual(routed.recommendedAction, 'REFINE_WORDING');

routed = routeRetellingTrainingV056(task('PASS'), process('FORMULATION_BREAKDOWN'));
assert.strictEqual(routed.primaryTrainingNeed, 'FORMULATION_BREAKDOWN');
assert.strictEqual(routed.recommendedAction, 'COMPLETE_FORMULATION');

routed = routeRetellingTrainingV056(task('PASS'), process('NONE'));
assert.strictEqual(routed.primaryTrainingNeed, 'PASS');
assert.notStrictEqual(routed.primaryTrainingNeed, 'INFORMATION_ORDER');
assert.notStrictEqual(routed.primaryTrainingNeed, 'LEXICAL_RETRIEVAL');

console.log('retelling expression router tests passed');
