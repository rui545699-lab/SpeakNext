'use strict';

const assert = require('assert');
const cases = require('../eval/retelling-dual-progress-cases');
const {
  REPEATS,
  runProgressEval
} = require('../eval/run-retelling-dual-progress-eval');

const report = runProgressEval();

assert.strictEqual(cases.length, 16);
assert.strictEqual(REPEATS, 3);
assert.strictEqual(report.totalRuns, 48);
assert.strictEqual(report.metrics.secondTaskAccuracy, 100);
assert.strictEqual(report.metrics.secondProcessAccuracy, 100);
assert.strictEqual(report.metrics.resolverAccuracy, 100);
assert.strictEqual(report.metrics.fullProgressDecisionAccuracy, 100);
assert.strictEqual(report.metrics.resolvedFalsePositiveRate, 0);
assert.strictEqual(report.metrics.resolvedFalseNegativeRate, 0);
assert.strictEqual(report.metrics.evidenceGroundingRate, 100);
assert.strictEqual(report.metrics.taskConsistency, 100);
assert.strictEqual(report.metrics.processConsistency, 100);
assert.strictEqual(report.metrics.resolverConsistency, 100);
assert.strictEqual(report.metrics.fullPipelineConsistency, 100);
assert.strictEqual(report.metrics.apiSuccessRate, 100);
assert.strictEqual(report.metrics.apiRequestsMade, 0);
assert.strictEqual(report.metrics.apiMetricApplicable, false);

console.log('retelling dual progress eval tests passed');
