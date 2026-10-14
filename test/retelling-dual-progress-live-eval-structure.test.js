'use strict';

const assert = require('assert');
const liveCases = require('../eval/retelling-dual-progress-live-cases');
const deterministicCases = require('../eval/retelling-dual-progress-cases');
const {
  DEFAULT_REPEATS,
  SMOKE_CASE_IDS,
  parseRepeat,
  getRunConfig,
  createRunPlan,
  calculateMetrics,
  calculateRepeatConsistency,
  runLiveEvaluation
} = require('../eval/run-retelling-dual-progress-live-eval');

async function run() {
  assert.strictEqual(liveCases.length, 16);
  assert.deepStrictEqual(liveCases.map((item) => item.id), [
    'P01_missing_resolved',
    'P02_missing_unresolved',
    'P03_incorrect_resolved',
    'P04_incorrect_still_incorrect',
    'P05_lexical_resolved',
    'P06_lexical_content_deleted',
    'P07_order_resolved',
    'P08_order_still_disordered',
    'P09_order_new_incorrect_relation',
    'P10_order_resolved_supporting_omission',
    'P11_uncertain_became_evaluable',
    'P12_uncertain_still_uncertain',
    'P13_lexical_contextual_control',
    'P14_incorrect_resolved_with_filler',
    'P15_order_resolved_relation_not_established',
    'P16_missing_points_present_relation_missing'
  ]);
  assert.deepStrictEqual(SMOKE_CASE_IDS, [
    'P01_missing_resolved',
    'P03_incorrect_resolved',
    'P04_incorrect_still_incorrect',
    'P05_lexical_resolved',
    'P06_lexical_content_deleted',
    'P09_order_new_incorrect_relation',
    'P11_uncertain_became_evaluable',
    'P15_order_resolved_relation_not_established'
  ]);

  liveCases.forEach((item) => {
    const source = deterministicCases.find((candidate) => candidate.id === item.sourceFixtureId);
    assert.ok(source, `${item.id} deterministic source`);
    assert.strictEqual(item.firstRoundResult, source.firstRoundResult, `${item.id} uses fixed first round`);
    assert.strictEqual(item.secondTranscript, source.secondRoundResult.transcript);
    assert.deepStrictEqual(item.gold, {
      secondTask: source.gold.secondTask,
      secondProcess: source.gold.secondProcess,
      resolved: source.gold.resolved,
      improvementType: source.gold.improvementType,
      reasonCode: source.gold.reasonCode
    });
  });

  const smoke = getRunConfig(['--smoke']);
  assert.strictEqual(smoke.mode, 'SMOKE');
  assert.strictEqual(smoke.cases.length, 8);
  assert.strictEqual(smoke.repeats, DEFAULT_REPEATS);
  assert.strictEqual(smoke.repeats, 1);
  assert.strictEqual(smoke.plannedRequests, 8);

  const full = getRunConfig([]);
  assert.strictEqual(full.mode, 'FULL');
  assert.strictEqual(full.cases.length, 16);
  assert.strictEqual(full.repeats, 1);
  assert.strictEqual(full.plannedRequests, 16);
  assert.deepStrictEqual(full.cases.map((item) => item.id), liveCases.map((item) => item.id));

  const repeatThree = getRunConfig(['--smoke', '--repeat', '3']);
  assert.strictEqual(repeatThree.cases.length, 8);
  assert.strictEqual(repeatThree.repeats, 3);
  assert.strictEqual(repeatThree.plannedRequests, 24);
  assert.strictEqual(createRunPlan(repeatThree).length, 24);
  const fullRepeatThree = getRunConfig(['--repeat', '3']);
  assert.strictEqual(fullRepeatThree.cases.length, 16);
  assert.strictEqual(fullRepeatThree.repeats, 3);
  assert.strictEqual(fullRepeatThree.plannedRequests, 48);
  assert.strictEqual(createRunPlan(fullRepeatThree).length, 48);
  liveCases.forEach((item) => {
    assert.strictEqual(
      createRunPlan(fullRepeatThree).filter((entry) => entry.item.sourceFixtureId === item.sourceFixtureId).length,
      3,
      `${item.id} appears three times in full plan`
    );
  });
  assert.strictEqual(parseRepeat(['--repeat=5']), 5);
  assert.throws(() => getRunConfig(['--repeat', '0']), /positive integer/);
  assert.throws(() => getRunConfig(['--repeat', 'abc']), /positive integer/);
  assert.throws(() => getRunConfig(['--repeat', '-1']), /positive integer/);
  assert.throws(() => getRunConfig(['--repeat']), /positive integer/);

  const evaluatorInputs = [];
  const mockEvaluator = async (input) => {
    evaluatorInputs.push(input);
    assert.deepStrictEqual(Object.keys(input).sort(), ['material', 'transcript']);
    assert.ok(!Object.prototype.hasOwnProperty.call(input, 'firstRoundResult'));
    const live = liveCases.find((item) => item.secondTranscript === input.transcript);
    const source = deterministicCases.find((item) => item.id === live.sourceFixtureId);
    return {
      taskResult: source.secondRoundResult.taskResult,
      processResult: source.secondRoundResult.processResult,
      routedResult: source.secondRoundResult.routedResult,
      requestId: `mock-${source.id}`,
      retryCount: 0,
      relationRepairCount: 0
    };
  };

  const report = await runLiveEvaluation(repeatThree, mockEvaluator);
  assert.strictEqual(evaluatorInputs.length, 24, 'one second-round Dual observation per repeat');
  assert.strictEqual(report.configuration.firstRoundLiveEvaluation, false);
  assert.strictEqual(report.configuration.secondRoundLiveEvaluation, true);
  assert.strictEqual(report.configuration.legacyProgressLlmUsed, false);
  assert.strictEqual(report.api.totalRequests, 24);
  assert.strictEqual(report.api.successfulRequests, 24);
  assert.strictEqual(report.api.successRate, 100);
  assert.strictEqual(report.metrics.secondTaskAccuracy, 100);
  assert.strictEqual(report.metrics.secondProcessAccuracy, 100);
  assert.strictEqual(report.metrics.resolverAccuracy, 100);
  assert.strictEqual(report.metrics.fullProgressDecisionAccuracy, 100);
  assert.strictEqual(report.metrics.resolvedFalsePositiveRate, 0);
  assert.strictEqual(report.metrics.resolvedFalseNegativeRate, 0);
  assert.strictEqual(report.metrics.evidenceGroundingRate, 100);
  assert.strictEqual(report.consistency.repeatConsistencyEvaluable, true);
  assert.strictEqual(report.consistency.secondTaskConsistency, 100);
  assert.strictEqual(report.consistency.secondProcessConsistency, 100);
  assert.strictEqual(report.consistency.resolverConsistency, 100);
  assert.strictEqual(report.consistency.fullProgressPipelineConsistency, 100);
  assert.deepStrictEqual(report.consistency.taskUnstableCases, []);
  assert.deepStrictEqual(report.consistency.processUnstableCases, []);
  assert.deepStrictEqual(report.consistency.resolverUnstableCases, []);
  assert.deepStrictEqual(report.consistency.fullPipelineUnstableCases, []);

  report.cases.forEach((item) => item.runs.forEach((result) => {
    assert.ok(!result.progressResult.beforeEvidence
      || item.firstRoundResult.transcript.includes(result.progressResult.beforeEvidence));
    assert.ok(!result.progressResult.afterEvidence
      || item.secondTranscript.includes(result.progressResult.afterEvidence));
    assert.strictEqual(result.evidenceGrounded, true);
  }));

  const unresolvedGold = {
    id: 'FALSE_POSITIVE_CONTROL',
    gold: {
      secondTask: 'INCORRECT_RELATION',
      secondProcess: 'NONE',
      resolved: false,
      improvementType: null,
      reasonCode: 'RELATION_STILL_INCORRECT'
    },
    runs: [{
      status: 'SUCCESS',
      secondTask: 'INCORRECT_RELATION',
      secondProcess: 'NONE',
      progressResult: {
        resolved: true,
        improvementType: 'RELATION_CORRECTED',
        reasonCode: 'RELATION_CORRECTED'
      },
      evidenceGrounded: true
    }]
  };
  const falsePositiveMetrics = calculateMetrics([unresolvedGold]);
  assert.strictEqual(falsePositiveMetrics.resolvedFalsePositiveRate, 100);
  assert.strictEqual(falsePositiveMetrics.resolverAccuracy, 0);
  assert.strictEqual(falsePositiveMetrics.fullProgressDecisionAccuracy, 0);

  const once = calculateRepeatConsistency([{
    id: 'ONCE',
    runs: [{
      status: 'SUCCESS',
      secondTask: 'PASS',
      secondProcess: 'NONE',
      progressResult: { resolved: true, improvementType: 'X', reasonCode: 'Y' }
    }]
  }], 1);
  assert.strictEqual(once.repeatConsistencyEvaluable, false);
  assert.strictEqual(once.secondTaskConsistency, 100);
  assert.strictEqual(once.secondProcessConsistency, 100);
  assert.strictEqual(once.resolverConsistency, 100);
  assert.strictEqual(once.fullProgressPipelineConsistency, 100);

  const drift = calculateRepeatConsistency([{
    id: 'DRIFT',
    runs: [
      {
        status: 'SUCCESS', secondTask: 'PASS', secondProcess: 'NONE',
        progressResult: { resolved: true, improvementType: 'A', reasonCode: 'A' }
      },
      {
        status: 'SUCCESS', secondTask: 'UNCERTAIN', secondProcess: 'INFORMATION_ORDER',
        progressResult: { resolved: false, improvementType: null, reasonCode: 'B' }
      }
    ]
  }], 2);
  assert.deepStrictEqual(drift.taskUnstableCases, ['DRIFT']);
  assert.deepStrictEqual(drift.processUnstableCases, ['DRIFT']);
  assert.deepStrictEqual(drift.resolverUnstableCases, ['DRIFT']);
  assert.deepStrictEqual(drift.fullPipelineUnstableCases, ['DRIFT']);
  assert.strictEqual(drift.secondTaskConsistency, 0);
  assert.strictEqual(drift.secondProcessConsistency, 0);
  assert.strictEqual(drift.resolverConsistency, 0);
  assert.strictEqual(drift.fullProgressPipelineConsistency, 0);

  console.log('retelling dual progress live eval structure tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
