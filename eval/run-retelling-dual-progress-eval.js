'use strict';

const cases = require('./retelling-dual-progress-cases');
const {
  resolveRetellingProgress
} = require('../cloudfunctions/analyzeSpeech/lib/retelling-progress-resolver');

const REPEATS = 3;

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 100;
}

function evidenceIsGrounded(text, transcript) {
  return !text || String(transcript || '').includes(text);
}

function runProgressEval(inputCases = cases, repeats = REPEATS) {
  const runs = [];
  inputCases.forEach((item) => {
    for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
      const result = resolveRetellingProgress(item);
      const secondTask = item.secondRoundResult.taskResult.taskStatus;
      const secondProcess = item.secondRoundResult.processResult.processIssue;
      const taskCorrect = secondTask === item.gold.secondTask;
      const processCorrect = secondProcess === item.gold.secondProcess;
      const resolverCorrect = result.resolved === item.gold.resolved
        && result.improvementType === item.gold.improvementType
        && result.reasonCode === item.gold.reasonCode;
      const evidenceGrounded = evidenceIsGrounded(result.beforeEvidence, item.firstRoundResult.transcript)
        && evidenceIsGrounded(result.afterEvidence, item.secondRoundResult.transcript);
      runs.push({
        id: item.id,
        repeatIndex: repeatIndex + 1,
        taskCorrect,
        processCorrect,
        resolverCorrect,
        fullCorrect: taskCorrect && processCorrect && resolverCorrect && evidenceGrounded,
        evidenceGrounded,
        expectedResolved: item.gold.resolved,
        result,
        secondTask,
        secondProcess
      });
    }
  });

  const stable = (selector) => inputCases.filter((item) => {
    const values = runs.filter((run) => run.id === item.id).map(selector);
    return values.every((value) => value === values[0]);
  }).length;
  const correct = (key) => runs.filter((run) => run[key]).length;
  const falsePositives = runs.filter((run) => run.result.resolved && !run.expectedResolved).length;
  const falseNegatives = runs.filter((run) => !run.result.resolved && run.expectedResolved).length;
  const resolvedSignature = (run) => `${run.result.resolved}|${run.result.improvementType}|${run.result.reasonCode}`;
  const pipelineSignature = (run) => `${run.secondTask}|${run.secondProcess}|${resolvedSignature(run)}`;

  return {
    mode: 'DETERMINISTIC',
    cases: inputCases.length,
    repeats,
    totalRuns: runs.length,
    metrics: {
      secondTaskAccuracy: percent(correct('taskCorrect'), runs.length),
      secondProcessAccuracy: percent(correct('processCorrect'), runs.length),
      resolverAccuracy: percent(correct('resolverCorrect'), runs.length),
      fullProgressDecisionAccuracy: percent(correct('fullCorrect'), runs.length),
      resolvedFalsePositiveRate: percent(falsePositives, runs.length),
      resolvedFalseNegativeRate: percent(falseNegatives, runs.length),
      evidenceGroundingRate: percent(correct('evidenceGrounded'), runs.length),
      taskConsistency: percent(stable((run) => run.secondTask), inputCases.length),
      processConsistency: percent(stable((run) => run.secondProcess), inputCases.length),
      resolverConsistency: percent(stable(resolvedSignature), inputCases.length),
      fullPipelineConsistency: percent(stable(pipelineSignature), inputCases.length),
      apiSuccessRate: 100,
      apiRequestsMade: 0,
      apiMetricApplicable: false
    },
    runs
  };
}

function printReport(report) {
  console.log('Mode: DETERMINISTIC');
  console.log(`Cases: ${report.cases}`);
  console.log(`Repeats: ${report.repeats}`);
  console.log(`Total runs: ${report.totalRuns}`);
  Object.entries(report.metrics).forEach(([key, value]) => console.log(`${key}: ${value}`));
  report.runs.filter((run) => !run.fullCorrect).forEach((run) => {
    console.log(`FAIL ${run.id} repeat=${run.repeatIndex}`);
  });
}

if (require.main === module) {
  const report = runProgressEval();
  printReport(report);
  if (report.metrics.fullProgressDecisionAccuracy !== 100) process.exitCode = 1;
}

module.exports = {
  REPEATS,
  runProgressEval,
  evidenceIsGrounded
};
