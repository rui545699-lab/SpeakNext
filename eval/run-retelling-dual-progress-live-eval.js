'use strict';

const fs = require('fs');
const path = require('path');
const cases = require('./retelling-dual-progress-live-cases');
const { evaluateRetellingDual } = require('../cloudfunctions/analyzeSpeech/lib/retelling-dual-evaluator');
const { resolveRetellingProgress } = require('../cloudfunctions/analyzeSpeech/lib/retelling-progress-resolver');

const DEFAULT_REPEATS = 1;
const SMOKE_CASE_IDS = Object.freeze([
  'P01_missing_resolved',
  'P03_incorrect_resolved',
  'P04_incorrect_still_incorrect',
  'P05_lexical_resolved',
  'P06_lexical_content_deleted',
  'P09_order_new_incorrect_relation',
  'P11_uncertain_became_evaluable',
  'P15_order_resolved_relation_not_established'
]);

function percent(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function parseRepeat(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const spacedIndexes = args.reduce((indexes, value, index) => {
    if (value === '--repeat') indexes.push(index);
    return indexes;
  }, []);
  const inlineValues = args
    .filter((value) => typeof value === 'string' && value.startsWith('--repeat='))
    .map((value) => value.slice('--repeat='.length));
  if (spacedIndexes.length + inlineValues.length > 1) {
    throw new Error('Invalid --repeat: specify it only once.');
  }
  if (!spacedIndexes.length && !inlineValues.length) return DEFAULT_REPEATS;
  const raw = spacedIndexes.length ? args[spacedIndexes[0] + 1] : inlineValues[0];
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    throw new Error('Invalid --repeat: expected a positive integer greater than or equal to 1.');
  }
  return Number(raw);
}

function getRunConfig(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const smoke = args.includes('--smoke');
  const repeats = parseRepeat(args);
  const selected = smoke
    ? SMOKE_CASE_IDS.map((id) => cases.find((item) => item.id === id)).filter(Boolean)
    : cases.slice();
  return {
    mode: smoke ? 'SMOKE' : 'FULL',
    cases: selected,
    repeats,
    plannedRequests: selected.length * repeats
  };
}

function createRunPlan(config) {
  return config.cases.flatMap((item) => Array.from({ length: config.repeats }, (_, repeatIndex) => ({
    item,
    repeatIndex: repeatIndex + 1
  })));
}

function evidenceIsGrounded(text, transcript) {
  return !text || String(transcript || '').includes(String(text));
}

function progressDecision(result) {
  return {
    resolved: result.resolved,
    improvementType: result.improvementType,
    reasonCode: result.reasonCode
  };
}

function calculateMetrics(caseResults) {
  const successfulRuns = caseResults.flatMap((item) => item.runs.map((run) => ({ item, run })))
    .filter(({ run }) => run.status === 'SUCCESS');
  let taskCorrect = 0;
  let processCorrect = 0;
  let resolverCorrect = 0;
  let fullCorrect = 0;
  let unresolvedGold = 0;
  let resolvedGold = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let evidenceGrounded = 0;

  successfulRuns.forEach(({ item, run }) => {
    const taskOk = run.secondTask === item.gold.secondTask;
    const processOk = run.secondProcess === item.gold.secondProcess;
    const resolvedOk = run.progressResult.resolved === item.gold.resolved;
    const improvementOk = run.progressResult.improvementType === item.gold.improvementType;
    const reasonOk = run.progressResult.reasonCode === item.gold.reasonCode;
    const resolverOk = resolvedOk && improvementOk && reasonOk;
    if (taskOk) taskCorrect += 1;
    if (processOk) processCorrect += 1;
    if (resolverOk) resolverCorrect += 1;
    if (taskOk && processOk && resolverOk) fullCorrect += 1;
    if (item.gold.resolved) {
      resolvedGold += 1;
      if (!run.progressResult.resolved) falseNegatives += 1;
    } else {
      unresolvedGold += 1;
      if (run.progressResult.resolved) falsePositives += 1;
    }
    if (run.evidenceGrounded) evidenceGrounded += 1;
  });

  const total = successfulRuns.length;
  return {
    secondTaskAccuracy: percent(taskCorrect, total),
    secondProcessAccuracy: percent(processCorrect, total),
    resolverAccuracy: percent(resolverCorrect, total),
    fullProgressDecisionAccuracy: percent(fullCorrect, total),
    resolvedFalsePositiveRate: percent(falsePositives, unresolvedGold),
    resolvedFalseNegativeRate: percent(falseNegatives, resolvedGold),
    evidenceGroundingRate: percent(evidenceGrounded, total),
    counts: {
      successful: total,
      taskCorrect,
      processCorrect,
      resolverCorrect,
      fullCorrect,
      unresolvedGold,
      resolvedGold,
      falsePositives,
      falseNegatives,
      evidenceGrounded
    }
  };
}

function calculateRepeatConsistency(caseResults, repeats) {
  function stable(item, signature) {
    const successful = item.runs.filter((run) => run.status === 'SUCCESS');
    return successful.length === item.runs.length
      && successful.length > 0
      && new Set(successful.map(signature)).size === 1;
  }
  const taskUnstableCases = caseResults
    .filter((item) => !stable(item, (run) => run.secondTask))
    .map((item) => item.id);
  const processUnstableCases = caseResults
    .filter((item) => !stable(item, (run) => run.secondProcess))
    .map((item) => item.id);
  const resolverUnstableCases = caseResults
    .filter((item) => !stable(item, (run) => JSON.stringify(progressDecision(run.progressResult))))
    .map((item) => item.id);
  const fullPipelineUnstableCases = caseResults
    .filter((item) => !stable(item, (run) => JSON.stringify([
      run.secondTask,
      run.secondProcess,
      progressDecision(run.progressResult)
    ])))
    .map((item) => item.id);
  const total = caseResults.length;
  return {
    repeatConsistencyEvaluable: repeats >= 2,
    secondTaskConsistency: percent(total - taskUnstableCases.length, total),
    secondProcessConsistency: percent(total - processUnstableCases.length, total),
    resolverConsistency: percent(total - resolverUnstableCases.length, total),
    fullProgressPipelineConsistency: percent(total - fullPipelineUnstableCases.length, total),
    taskUnstableCases,
    processUnstableCases,
    resolverUnstableCases,
    fullPipelineUnstableCases
  };
}

async function runLiveEvaluation(config, evaluator = evaluateRetellingDual) {
  const caseResults = config.cases.map((item) => ({
    id: item.id,
    sourceFixtureId: item.sourceFixtureId,
    originalTrainingNeed: item.originalTrainingNeed,
    firstRoundResult: item.firstRoundResult,
    secondTranscript: item.secondTranscript,
    gold: item.gold,
    runs: []
  }));

  for (const entry of createRunPlan(config)) {
    const target = caseResults.find((item) => item.id === entry.item.id);
    try {
      // The first round is a frozen fixture. Only the second transcript reaches the live evaluator.
      const observation = await evaluator({
        material: entry.item.material,
        transcript: entry.item.secondTranscript
      });
      const secondRoundResult = {
        transcript: entry.item.secondTranscript,
        taskResult: observation.taskResult,
        processResult: observation.processResult,
        routedResult: observation.routedResult
      };
      const progressResult = resolveRetellingProgress({
        originalTrainingNeed: entry.item.originalTrainingNeed,
        firstRoundResult: entry.item.firstRoundResult,
        secondRoundResult
      });
      const evidenceGrounded = evidenceIsGrounded(
        progressResult.beforeEvidence,
        entry.item.firstRoundResult.transcript
      ) && evidenceIsGrounded(progressResult.afterEvidence, entry.item.secondTranscript);
      target.runs.push({
        repeatIndex: entry.repeatIndex,
        status: 'SUCCESS',
        secondTask: observation.taskResult.taskStatus,
        secondProcess: observation.processResult.processIssue,
        secondRouted: observation.routedResult.primaryTrainingNeed,
        secondRoundResult,
        progressResult,
        evidenceGrounded,
        requestId: observation.requestId || '',
        retryCount: observation.retryCount || 0,
        relationRepairCount: observation.relationRepairCount || 0
      });
    } catch (error) {
      target.runs.push({
        repeatIndex: entry.repeatIndex,
        status: 'ERROR',
        errorType: error && (error.outputErrorType || error.message) || 'PROGRESS_LIVE_EVAL_ERROR'
      });
    }
  }

  const successfulRequests = caseResults.flatMap((item) => item.runs)
    .filter((run) => run.status === 'SUCCESS').length;
  return {
    generatedAt: new Date().toISOString(),
    configuration: {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      mode: config.mode,
      caseCount: config.cases.length,
      runsPerCase: config.repeats,
      totalRequests: config.plannedRequests,
      firstRoundLiveEvaluation: false,
      secondRoundLiveEvaluation: true,
      legacyProgressLlmUsed: false,
      asrUsed: false
    },
    api: {
      successfulRequests,
      totalRequests: config.plannedRequests,
      successRate: percent(successfulRequests, config.plannedRequests)
    },
    metrics: calculateMetrics(caseResults),
    consistency: calculateRepeatConsistency(caseResults, config.repeats),
    cases: caseResults
  };
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function writeResults(report) {
  const directory = path.join(__dirname, 'results');
  fs.mkdirSync(directory, { recursive: true });
  const suffix = report.configuration.mode === 'SMOKE' ? '-smoke' : '';
  const time = stamp();
  const jsonPath = path.join(directory, `retelling-dual-progress-live-eval${suffix}-${time}.json`);
  const csvPath = path.join(directory, `retelling-dual-progress-live-eval${suffix}-summary-${time}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const headers = [
    'case_id', 'repeat', 'gold_task', 'actual_task', 'gold_process', 'actual_process',
    'gold_resolved', 'actual_resolved', 'gold_improvement_type', 'actual_improvement_type',
    'gold_reason_code', 'actual_reason_code', 'evidence_grounded', 'status'
  ];
  const rows = report.cases.flatMap((item) => item.runs.map((run) => [
    item.id,
    run.repeatIndex,
    item.gold.secondTask,
    run.secondTask,
    item.gold.secondProcess,
    run.secondProcess,
    item.gold.resolved,
    run.progressResult && run.progressResult.resolved,
    item.gold.improvementType,
    run.progressResult && run.progressResult.improvementType,
    item.gold.reasonCode,
    run.progressResult && run.progressResult.reasonCode,
    run.evidenceGrounded,
    run.status
  ].map(csvCell).join(',')));
  fs.writeFileSync(csvPath, `${headers.map(csvCell).join(',')}\n${rows.join('\n')}\n`, 'utf8');
  return { jsonPath, csvPath };
}

async function main() {
  const config = getRunConfig(process.argv.slice(2));
  console.log('THIS COMMAND CALLS DEEPSEEK AND MAY INCUR API COST.');
  console.log(`Mode: ${config.mode}`);
  console.log(`Cases: ${config.cases.length}`);
  console.log(`Repeats: ${config.repeats}`);
  console.log(`Planned API requests: ${config.plannedRequests}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('Dual Progress Live Eval stopped: DEEPSEEK_API_KEY is not configured. No API requests were made.');
    process.exitCode = 2;
    return;
  }

  const report = await runLiveEvaluation(config);
  const files = writeResults(report);
  console.log(report.metrics);
  console.log(report.consistency);
  console.log(`API success rate: ${report.api.successRate}%`);
  console.log(`JSON: ${files.jsonPath}`);
  console.log(`CSV: ${files.csvPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Dual Progress Live Eval failed safely:', error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_REPEATS,
  SMOKE_CASE_IDS,
  percent,
  parseRepeat,
  getRunConfig,
  createRunPlan,
  evidenceIsGrounded,
  progressDecision,
  calculateMetrics,
  calculateRepeatConsistency,
  runLiveEvaluation,
  writeResults
};
