const assert = require('assert');
const cases = require('../eval/live-cases');
const {
  calculateLayerMetrics,
  classifyCase
} = require('../eval/live-eval-utils');
const {
  getRunConfig,
  RUNS_PER_CASE,
  SMOKE_CASE_IDS,
  TARGETED_CASE_IDS
} = require('../eval/run-live-eval');

assert.strictEqual(cases.length, 20);
const distribution = cases.reduce((counts, item) => {
  const label = item.gold.questionApplicable === false
    ? 'NOT_APPLICABLE'
    : item.gold.needsIntervention
      ? item.gold.primaryIssue
      : 'CLEAR';
  counts[label] = (counts[label] || 0) + 1;
  return counts;
}, {});
assert.deepStrictEqual(distribution, {
  CLEAR: 4,
  CONTENT_START: 3,
  CONTENT_EXPAND: 4,
  LEXICAL_RETRIEVAL: 3,
  INFORMATION_ORDER: 2,
  UNCERTAIN: 2,
  NOT_APPLICABLE: 2
});

const smokeConfig = getRunConfig(['--smoke']);
assert.strictEqual(smokeConfig.mode, 'SMOKE');
assert.strictEqual(smokeConfig.cases.length, 3);
assert.strictEqual(smokeConfig.repeats, 1);
assert.strictEqual(smokeConfig.plannedRequests, 3);
assert.deepStrictEqual(smokeConfig.cases.map((item) => item.id), SMOKE_CASE_IDS);
assert.deepStrictEqual(
  smokeConfig.cases.map((item) => item.gold.primaryIssue),
  [null, 'CONTENT_START', 'LEXICAL_RETRIEVAL']
);

const fullConfig = getRunConfig([]);
assert.strictEqual(fullConfig.mode, 'FULL');
assert.strictEqual(fullConfig.cases.length, 20);
assert.strictEqual(fullConfig.repeats, RUNS_PER_CASE);
assert.strictEqual(fullConfig.plannedRequests, 60);

const targetedConfig = getRunConfig(['--targeted']);
assert.strictEqual(targetedConfig.mode, 'TARGETED');
assert.strictEqual(targetedConfig.cases.length, 3);
assert.strictEqual(targetedConfig.repeats, 3);
assert.strictEqual(targetedConfig.plannedRequests, 9);
assert.deepStrictEqual(targetedConfig.cases.map((item) => item.id), TARGETED_CASE_IDS);
assert.deepStrictEqual(
  targetedConfig.cases.map((item) => item.gold.primaryIssue),
  ['UNCERTAIN', 'UNCERTAIN', 'CONTENT_START']
);

const item = cases[0];
const correctDecision = Object.assign({}, item.gold);
const wrongRawDecision = {
  questionApplicable: true,
  needsIntervention: true,
  primaryIssue: 'CONTENT_EXPAND',
  recommendedIntervention: 'ONE_DETAIL'
};
const syntheticRun = {
  status: 'SUCCESS',
  rawDecision: wrongRawDecision,
  finalDecision: correctDecision
};
const raw = calculateLayerMetrics([{ item, run: syntheticRun }], 'raw');
const final = calculateLayerMetrics([{ item, run: syntheticRun }], 'final');
assert.strictEqual(raw.fullDecisionAccuracy, 0);
assert.strictEqual(final.fullDecisionAccuracy, 100);
assert.strictEqual(classifyCase(item, [syntheticRun, syntheticRun, syntheticRun]).labels.includes('GUARD_RECOVERED'), true);

console.log('live eval structure tests passed');
