'use strict';

const assert = require('assert');
const cases = require('../eval/retelling-new-material-semantic-live-cases');
const { calculateMetrics } = require('../eval/run-retelling-new-material-semantic-live-eval');

assert.strictEqual(cases.length, 18);
['retelling_001', 'retelling_002', 'retelling_003', 'retelling_004', 'retelling_005', 'retelling_006']
  .forEach((id) => {
    const selected = cases.filter((item) => item.id.startsWith(id));
    assert.deepStrictEqual(selected.map((item) => item.variant), ['partial', 'complete', 'negative']);
    assert.deepStrictEqual(selected.map((item) => item.gold.expectedK3), [true, true, false]);
  });

const synthetic = cases.map((item) => ({
  status: 'SUCCESS',
  gold: item.gold,
  actual: {
    task: item.gold.task,
    routed: item.gold.routed,
    k3Covered: item.gold.expectedK3,
    evidenceGrounded: true
  }
}));
assert.deepStrictEqual(calculateMetrics(synthetic), {
  apiSuccessRate: 100,
  k3CoverageAccuracy: 100,
  falseK3CoverageRate: 0,
  taskAccuracy: 100,
  routedDecisionAccuracy: 100,
  evidenceGroundingRate: 100
});

console.log('retelling new material semantic live eval structure tests passed');
