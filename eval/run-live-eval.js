const fs = require('fs');
const path = require('path');
const cases = require('./live-cases');
const {
  decisionMatches,
  runProductionDiagnosis,
  calculateLayerMetrics,
  classifyCase,
  confusionMatrixText,
  percent
} = require('./live-eval-utils');

const RUNS_PER_CASE = 3;
const SMOKE_CASE_IDS = [
  'E01_complete_experience',
  'E03_cannot_start',
  'E05_lexical_context'
];
const TARGETED_CASE_IDS = [
  'E24_uncertain_open_question',
  'E29_uncertain_asr',
  'E03_cannot_start'
];

function getRunConfig(argv) {
  const smoke = (argv || []).includes('--smoke');
  const targeted = (argv || []).includes('--targeted');
  const selectedIds = targeted ? TARGETED_CASE_IDS : (smoke ? SMOKE_CASE_IDS : null);
  const selectedCases = selectedIds
    ? selectedIds.map((id) => cases.find((item) => item.id === id)).filter(Boolean)
    : cases;
  const repeats = smoke && !targeted ? 1 : RUNS_PER_CASE;
  return {
    mode: targeted ? 'TARGETED' : (smoke ? 'SMOKE' : 'FULL'),
    cases: selectedCases,
    repeats,
    plannedRequests: selectedCases.length * repeats
  };
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeResults(report) {
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = timestamp();
  const modeSuffix = report.configuration.mode === 'SMOKE'
    ? '-smoke'
    : report.configuration.mode === 'TARGETED'
      ? '-targeted'
      : '';
  const jsonPath = path.join(resultsDir, `live-eval${modeSuffix}-${stamp}.json`);
  const csvPath = path.join(resultsDir, `live-eval${modeSuffix}-summary-${stamp}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const header = [
    'case_id', 'gold_primary_issue', 'run1_primary_issue', 'run2_primary_issue',
    'run3_primary_issue', 'final_consistent', 'correct_runs', 'false_intervention',
    'missed_intervention', 'labels'
  ];
  const rows = report.cases.map((item) => {
    const issues = item.runs.map((run) => run.status === 'SUCCESS'
      ? (run.finalDecision.primaryIssue || 'NONE')
      : 'API_ERROR');
    const correctRuns = item.runs.filter((run) => run.status === 'SUCCESS'
      && decisionMatches(run.finalDecision, item)).length;
    const falseIntervention = item.runs.some((run) => run.status === 'SUCCESS'
      && !item.gold.needsIntervention && run.finalDecision.needsIntervention);
    const missedIntervention = item.runs.some((run) => run.status === 'SUCCESS'
      && item.gold.needsIntervention && !run.finalDecision.needsIntervention);
    return [
      item.id,
      item.gold.primaryIssue || 'NONE',
      issues[0], issues[1], issues[2],
      item.stable,
      correctRuns,
      falseIntervention,
      missedIntervention,
      item.labels.join('|')
    ].map(csvCell).join(',');
  });
  fs.writeFileSync(csvPath, `${header.map(csvCell).join(',')}\n${rows.join('\n')}\n`, 'utf8');
  return { jsonPath, csvPath };
}

async function main() {
  const config = getRunConfig(process.argv.slice(2));
  console.log('THIS COMMAND CALLS DEEPSEEK AND MAY INCUR API COST.');
  console.log(`Mode: ${config.mode}`);
  console.log(`Cases: ${config.cases.length}`);
  console.log(`Repeats: ${config.repeats}`);
  console.log(`Planned requests: ${config.plannedRequests}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('Live Eval stopped: DEEPSEEK_API_KEY is not configured. No API requests were made.');
    process.exitCode = 2;
    return;
  }

  const caseResults = [];
  let requestNumber = 0;
  for (const item of config.cases) {
    const runs = [];
    for (let index = 0; index < config.repeats; index += 1) {
      requestNumber += 1;
      const run = await runProductionDiagnosis(item);
      runs.push(run);
      console.log(`[LIVE EVAL] ${requestNumber}/${config.plannedRequests} ${item.id} run=${index + 1}`, {
        status: run.status,
        requestId: run.requestId || '',
        finish_reason: run.finishReason || '',
        retryCount: Number(run.retryCount) || 0,
        rawPrimaryIssue: run.rawDecision ? run.rawDecision.primaryIssue : null,
        finalPrimaryIssue: run.finalDecision ? run.finalDecision.primaryIssue : null
      });
    }
    const classified = classifyCase(item, runs);
    caseResults.push(Object.assign({}, item, {
      runs,
      labels: classified.labels,
      stable: classified.stable
    }));
  }

  const successfulRuns = [];
  const rawParsedRuns = [];
  let apiSuccessfulRequests = 0;
  caseResults.forEach((item) => item.runs.forEach((run) => {
    if (run.status === 'SUCCESS' || run.status === 'GUARD_ERROR') {
      apiSuccessfulRequests += 1;
      if (item.scored !== false) rawParsedRuns.push({ item, run });
    }
    if (run.status === 'SUCCESS' && item.scored !== false) successfulRuns.push({ item, run });
  }));
  const totalRequests = config.plannedRequests;
  const rawMetrics = calculateLayerMetrics(rawParsedRuns, 'raw');
  const finalMetrics = calculateLayerMetrics(successfulRuns, 'final');
  const stableCases = caseResults.filter((item) => item.stable).length;
  const report = {
    generatedAt: new Date().toISOString(),
    configuration: {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      mode: config.mode,
      caseCount: config.cases.length,
      runsPerCase: config.repeats,
      concurrency: 1,
      totalRequests
    },
    api: {
      successfulRequests: apiSuccessfulRequests,
      totalRequests,
      successRate: percent(apiSuccessfulRequests, totalRequests)
    },
    rawMetrics,
    finalMetrics,
    repeatedRunConsistency: percent(stableCases, caseResults.length),
    stableCases,
    failures: caseResults.filter((item) => item.runs.some((run) => run.status !== 'SUCCESS'
      || !decisionMatches(run.finalDecision, item))).map((item) => item.id),
    unstableCases: caseResults.filter((item) => !item.stable).map((item) => item.id),
    guardRecoveredCases: caseResults.filter((item) => item.labels.includes('GUARD_RECOVERED')).map((item) => item.id),
    futureGapObservations: caseResults.filter((item) => item.futureIssue).map((item) => ({
      id: item.id,
      futureIssue: item.futureIssue,
      outputs: item.runs.map((run) => run.finalDecision || null)
    })),
    cases: caseResults
  };
  const files = writeResults(report);

  console.log('\nRAW MODEL');
  console.log(rawMetrics);
  console.log('\nFINAL AFTER GUARD');
  console.log(finalMetrics);
  console.log(`\nAPI success rate: ${report.api.successRate}%`);
  console.log(`Repeated-run consistency: ${report.repeatedRunConsistency}%`);
  console.log('\nFINAL confusion matrix');
  console.log(confusionMatrixText(finalMetrics.confusionMatrix));
  console.log(`\nFailed cases: ${report.failures.join(', ') || 'none'}`);
  console.log(`Unstable cases: ${report.unstableCases.join(', ') || 'none'}`);
  console.log(`Guard recovered cases: ${report.guardRecoveredCases.join(', ') || 'none'}`);
  console.log(`JSON: ${files.jsonPath}`);
  console.log(`CSV: ${files.csvPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Live Eval failed safely:', error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  RUNS_PER_CASE,
  SMOKE_CASE_IDS,
  TARGETED_CASE_IDS,
  getRunConfig,
  writeResults
};
