const assert = require('assert');
const cases = require('../eval/retelling-dual-live-cases');
const {
  RUNS_PER_CASE,
  SMOKE_CASE_IDS,
  parseRepeat,
  getRunConfig,
  createRunPlan,
  calculateMetrics,
  calculateRepeatConsistency
} = require('../eval/run-retelling-dual-live-eval');

assert.strictEqual(cases.length, 16);
assert.deepStrictEqual(cases.find((item) => item.id === 'L09').gold, {
  task: 'RELATION_NOT_ESTABLISHED', process: 'INFORMATION_ORDER', routed: 'INFORMATION_ORDER'
});
assert.deepStrictEqual(cases.find((item) => item.id === 'L12').gold, {
  task: 'MISSING_CORE_CONTENT', process: 'LEXICAL_RETRIEVAL', routed: 'LEXICAL_RETRIEVAL'
});
const smoke = getRunConfig(['--smoke']);
assert.strictEqual(smoke.mode, 'SMOKE');
assert.deepStrictEqual(smoke.cases.map((item) => item.id), SMOKE_CASE_IDS);
assert.strictEqual(smoke.repeats, 1);
assert.strictEqual(smoke.plannedRequests, 6);
const smokeRepeatThree = getRunConfig(['--smoke', '--repeat', '3']);
assert.strictEqual(smokeRepeatThree.mode, 'SMOKE');
assert.strictEqual(smokeRepeatThree.cases.length, 6);
assert.strictEqual(smokeRepeatThree.repeats, 3);
assert.strictEqual(smokeRepeatThree.plannedRequests, 18);
assert.deepStrictEqual(smokeRepeatThree.cases.map((item) => item.id), SMOKE_CASE_IDS);
assert.deepStrictEqual(smokeRepeatThree.cases.map((item) => item.gold), smoke.cases.map((item) => item.gold));
const full = getRunConfig([]);
assert.strictEqual(full.repeats, RUNS_PER_CASE);
assert.strictEqual(full.repeats, 1);
assert.strictEqual(full.plannedRequests, 16);
const fullRepeatTwo = getRunConfig(['--repeat', '2']);
assert.strictEqual(fullRepeatTwo.repeats, 2);
assert.strictEqual(fullRepeatTwo.plannedRequests, 32);
const plan = createRunPlan(fullRepeatTwo);
assert.strictEqual(plan.length, 32);
cases.forEach((item) => {
  assert.strictEqual(plan.filter((entry) => entry.item.id === item.id).length, 2);
});
assert.strictEqual(parseRepeat(['--repeat=5']), 5);
assert.throws(() => getRunConfig(['--repeat', '0']), /positive integer/);
assert.throws(() => getRunConfig(['--repeat', 'abc']), /positive integer/);
assert.throws(() => getRunConfig(['--repeat', '-1']), /positive integer/);
assert.throws(() => getRunConfig(['--repeat']), /positive integer/);

const item = cases[0];
const metrics = calculateMetrics([{
  id: item.id,
  gold: item.gold,
  labels: item.labels,
  runs: [{ status: 'SUCCESS', decision: item.gold }]
}]);
assert.strictEqual(metrics.taskContentAccuracy, 100);
assert.strictEqual(metrics.processAccuracy, 100);
assert.strictEqual(metrics.routerAccuracy, 100);
assert.strictEqual(metrics.fullDualDecisionAccuracy, 100);
const once = calculateRepeatConsistency([{
  id: 'ONCE',
  runs: [{ status: 'SUCCESS', decision: { routed: 'PASS' } }]
}], 1);
assert.strictEqual(once.repeatedRunConsistency, 100);
assert.strictEqual(once.taskContentConsistency, 100);
assert.strictEqual(once.processConsistency, 100);
assert.strictEqual(once.routerConsistency, 100);
assert.strictEqual(once.fullPipelineConsistency, 100);
assert.strictEqual(once.repeatConsistencyEvaluable, false);
const taskDrift = calculateRepeatConsistency([{
  id: 'TASK_DRIFT',
  runs: [
    { status: 'SUCCESS', decision: { task: 'PASS', process: 'NONE', routed: 'PASS' } },
    { status: 'SUCCESS', decision: { task: 'UNCERTAIN', process: 'NONE', routed: 'PASS' } }
  ]
}], 2);
assert.strictEqual(taskDrift.taskContentConsistency, 0);
assert.strictEqual(taskDrift.processConsistency, 100);
assert.strictEqual(taskDrift.routerConsistency, 100);
assert.strictEqual(taskDrift.repeatedRunConsistency, 100);
assert.strictEqual(taskDrift.fullPipelineConsistency, 0);
assert.deepStrictEqual(taskDrift.taskUnstableCases, ['TASK_DRIFT']);
assert.deepStrictEqual(taskDrift.processUnstableCases, []);
assert.deepStrictEqual(taskDrift.routerUnstableCases, []);
assert.deepStrictEqual(taskDrift.fullPipelineUnstableCases, ['TASK_DRIFT']);
assert.strictEqual(taskDrift.repeatConsistencyEvaluable, true);

const processDrift = calculateRepeatConsistency([{
  id: 'PROCESS_DRIFT',
  runs: [
    { status: 'SUCCESS', decision: { task: 'PASS', process: 'NONE', routed: 'PASS' } },
    { status: 'SUCCESS', decision: { task: 'PASS', process: 'INFORMATION_ORDER', routed: 'PASS' } }
  ]
}], 2);
assert.strictEqual(processDrift.taskContentConsistency, 100);
assert.strictEqual(processDrift.processConsistency, 0);
assert.strictEqual(processDrift.routerConsistency, 100);
assert.strictEqual(processDrift.fullPipelineConsistency, 0);
assert.deepStrictEqual(processDrift.processUnstableCases, ['PROCESS_DRIFT']);

const allStable = calculateRepeatConsistency([{
  id: 'ALL_STABLE',
  runs: [
    { status: 'SUCCESS', decision: { task: 'PASS', process: 'NONE', routed: 'PASS' } },
    { status: 'SUCCESS', decision: { task: 'PASS', process: 'NONE', routed: 'PASS' } }
  ]
}], 2);
assert.strictEqual(allStable.taskContentConsistency, 100);
assert.strictEqual(allStable.processConsistency, 100);
assert.strictEqual(allStable.routerConsistency, 100);
assert.strictEqual(allStable.fullPipelineConsistency, 100);
assert.deepStrictEqual(allStable.taskUnstableCases, []);
assert.deepStrictEqual(allStable.processUnstableCases, []);
assert.deepStrictEqual(allStable.routerUnstableCases, []);
assert.deepStrictEqual(allStable.fullPipelineUnstableCases, []);

const routedUnstable = calculateRepeatConsistency([{
  id: 'ROUTER_DRIFT',
  runs: [
    { status: 'SUCCESS', decision: { routed: 'PASS' } },
    { status: 'SUCCESS', decision: { routed: 'UNCERTAIN' } }
  ]
}], 2);
assert.strictEqual(routedUnstable.repeatedRunConsistency, 0);
assert.strictEqual(routedUnstable.routerConsistency, 0);
console.log('retelling dual live eval structure tests passed');
