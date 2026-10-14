const assert = require('assert');
const cases = require('../eval/retelling-live-cases');
const {
  RUNS_PER_CASE,
  SMOKE_CASE_IDS,
  getRunConfig
} = require('../eval/run-retelling-live-eval');
const {
  calculateMetrics,
  classifyCase,
  normalizeDecision
} = require('../eval/retelling-live-eval-utils');

assert.strictEqual(cases.length, 16);
assert.deepStrictEqual(cases.map((item) => item.id), [
  'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08',
  'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16'
]);
assert.strictEqual(cases.filter((item) => item.gold.primaryTrainingNeed == null).length, 4);
assert.strictEqual(cases.find((item) => item.id === 'L13').labels.includes('LEXICAL_FALSE_POSITIVE_CONTROL'), true);

const smoke = getRunConfig(['--smoke']);
assert.strictEqual(smoke.mode, 'SMOKE');
assert.strictEqual(smoke.cases.length, 5);
assert.strictEqual(smoke.repeats, 1);
assert.strictEqual(smoke.plannedRequests, 5);
assert.deepStrictEqual(smoke.cases.map((item) => item.id), SMOKE_CASE_IDS);
assert.deepStrictEqual(
  smoke.cases.map((item) => item.gold.primaryTrainingNeed || 'PASS'),
  ['PASS', 'MISSING_CAUSAL_STEP', 'INCORRECT_RELATION', 'LEXICAL_RETRIEVAL', 'UNCERTAIN']
);

const full = getRunConfig([]);
assert.strictEqual(full.mode, 'FULL');
assert.strictEqual(full.cases.length, 16);
assert.strictEqual(full.repeats, RUNS_PER_CASE);
assert.strictEqual(full.plannedRequests, 48);

const l01 = cases.find((item) => item.id === 'L01');
const goodRun = {
  status: 'SUCCESS',
  rawDecision: normalizeDecision({
    core_meaning_clear: false,
    primary_training_need: 'UNCERTAIN',
    recommended_action: 'OBSERVE_AGAIN'
  }),
  finalDecision: normalizeDecision({
    core_meaning_clear: true,
    primary_training_need: null,
    recommended_action: 'PASS'
  })
};
const classification = classifyCase(l01, [goodRun]);
assert.strictEqual(classification.stable, true);
assert.strictEqual(classification.guardRecovered, true);
assert.strictEqual(classification.failed, false);

const rawMetrics = calculateMetrics([{ item: l01, run: goodRun }], 'raw');
const finalMetrics = calculateMetrics([{ item: l01, run: goodRun }], 'final');
assert.strictEqual(rawMetrics.fullDecisionAccuracy, 0);
assert.strictEqual(rawMetrics.falseInterventionRate, 100);
assert.strictEqual(finalMetrics.fullDecisionAccuracy, 100);
assert.strictEqual(finalMetrics.falseInterventionRate, 0);
console.log('retelling live eval structure tests passed');
