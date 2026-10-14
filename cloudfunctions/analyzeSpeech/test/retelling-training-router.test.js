const assert = require('assert');
const { routeRetellingTraining } = require('../lib/retelling-training-router');

function task(taskStatus) {
  return { taskStatus, relations: [], keyPoints: [], incorrectClaims: [] };
}
function process(processIssue) {
  return { processIssue, evidence: [{ text: 'evidence' }] };
}

assert.strictEqual(routeRetellingTraining(task('PASS'), process('NONE')).primaryTrainingNeed, 'PASS');
assert.strictEqual(routeRetellingTraining(task('PASS'), process('LEXICAL_RETRIEVAL')).primaryTrainingNeed, 'LEXICAL_RETRIEVAL');
assert.strictEqual(routeRetellingTraining(task('PASS'), process('INFORMATION_ORDER')).primaryTrainingNeed, 'INFORMATION_ORDER');
assert.strictEqual(routeRetellingTraining(task('MISSING_CORE_CONTENT'), process('NONE')).primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(routeRetellingTraining(task('RELATION_NOT_ESTABLISHED'), process('INFORMATION_ORDER')).primaryTrainingNeed, 'INFORMATION_ORDER');
const relationMissing = routeRetellingTraining(task('RELATION_NOT_ESTABLISHED'), process('NONE'));
assert.strictEqual(relationMissing.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(relationMissing.recommendedAction, 'ADD_CAUSAL_LINK');
assert.strictEqual(routeRetellingTraining(task('INCORRECT_RELATION'), process('LEXICAL_RETRIEVAL')).primaryTrainingNeed, 'INCORRECT_RELATION');
const missingLexical = routeRetellingTraining(task('MISSING_CORE_CONTENT'), process('LEXICAL_RETRIEVAL'));
assert.strictEqual(missingLexical.primaryTrainingNeed, 'LEXICAL_RETRIEVAL');
assert.strictEqual(missingLexical.ruleId, 'ROUTE_EXPLICIT_LEXICAL_OVER_MISSING_CORE');
assert.strictEqual(routeRetellingTraining(task('UNCERTAIN'), process('NONE')).primaryTrainingNeed, 'UNCERTAIN');
assert.strictEqual(routeRetellingTraining(task('UNCERTAIN'), process('LEXICAL_RETRIEVAL')).primaryTrainingNeed, 'LEXICAL_RETRIEVAL');
console.log('retelling training router tests passed');
