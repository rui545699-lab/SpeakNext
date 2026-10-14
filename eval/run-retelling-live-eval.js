const fs = require('fs');
const path = require('path');
const cases = require('./retelling-live-cases');
const {
  decisionMatches,
  runProductionRetelling,
  calculateMetrics,
  classifyCase,
  percent
} = require('./retelling-live-eval-utils');

const RUNS_PER_CASE = 3;
const SMOKE_CASE_IDS = Object.freeze(['L01', 'L04', 'L07', 'L11', 'L14']);

function getRunConfig(argv) {
  const smoke = (argv || []).includes('--smoke');
  const selectedCases = smoke
    ? SMOKE_CASE_IDS.map((id) => cases.find((item) => item.id === id)).filter(Boolean)
    : cases;
  const repeats = smoke ? 1 : RUNS_PER_CASE;
  return {
    mode: smoke ? 'SMOKE' : 'FULL',
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
  const suffix = report.configuration.mode === 'SMOKE' ? '-smoke' : '';
  const stamp = timestamp();
  const jsonPath = path.join(resultsDir, `retelling-live-eval${suffix}-${stamp}.json`);
  const csvPath = path.join(resultsDir, `retelling-live-eval${suffix}-summary-${stamp}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const headers = [
    'case_id', 'gold',
    'run1_raw', 'run1_final',
    'run2_raw', 'run2_final',
    'run3_raw', 'run3_final',
    'stable', 'guard_recovered', 'failed'
  ];
  const rows = report.cases.map((item) => {
    const values = [];
    for (let index = 0; index < 3; index += 1) {
      const run = item.runs[index];
      values.push(run && run.rawDecision
        ? (run.rawDecision.primaryTrainingNeed || 'PASS')
        : 'API_ERROR');
      values.push(run && run.finalDecision
        ? (run.finalDecision.primaryTrainingNeed || 'PASS')
        : 'API_ERROR');
    }
    return [
      item.id,
      item.gold.primaryTrainingNeed || 'PASS',
      ...values,
      item.stable,
      item.guardRecovered,
      item.failed
    ].map(csvCell).join(',');
  });
  fs.writeFileSync(csvPath, `${headers.map(csvCell).join(',')}\n${rows.join('\n')}\n`, 'utf8');
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
    console.error('Retelling Live Eval stopped: DEEPSEEK_API_KEY is not configured. No API requests were made.');
    process.exitCode = 2;
    return;
  }

  const caseResults = [];
  let requestNumber = 0;
  for (const item of config.cases) {
    const runs = [];
    for (let index = 0; index < config.repeats; index += 1) {
      requestNumber += 1;
      const run = await runProductionRetelling(item);
      runs.push(run);
      console.log(`[RETELLING LIVE EVAL] ${requestNumber}/${config.plannedRequests} ${item.id} run=${index + 1}`, {
        status: run.status,
        requestId: run.requestId || '',
        finish_reason: run.finishReason || '',
        retryCount: Number(run.retryCount) || 0,
        raw: run.rawDecision ? (run.rawDecision.primaryTrainingNeed || 'PASS') : null,
        final: run.finalDecision ? (run.finalDecision.primaryTrainingNeed || 'PASS') : null
      });
    }
    const classification = classifyCase(item, runs);
    caseResults.push(Object.assign({}, item, classification, { runs }));
  }

  const rawRecords = [];
  const finalRecords = [];
  let successfulRequests = 0;
  caseResults.forEach((item) => item.runs.forEach((run) => {
    if (run.status === 'SUCCESS') {
      successfulRequests += 1;
      rawRecords.push({ item, run });
      finalRecords.push({ item, run });
    }
  }));
  const stableCases = caseResults.filter((item) => item.stable).length;
  const report = {
    generatedAt: new Date().toISOString(),
    configuration: {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      mode: config.mode,
      caseCount: config.cases.length,
      runsPerCase: config.repeats,
      totalRequests: config.plannedRequests,
      asrUsed: false
    },
    api: {
      successfulRequests,
      totalRequests: config.plannedRequests,
      successRate: percent(successfulRequests, config.plannedRequests)
    },
    rawMetrics: calculateMetrics(rawRecords, 'raw'),
    finalMetrics: calculateMetrics(finalRecords, 'final'),
    repeatedRunConsistency: percent(stableCases, caseResults.length),
    failedCases: caseResults.filter((item) => item.failed).map((item) => item.id),
    unstableCases: caseResults.filter((item) => !item.stable).map((item) => item.id),
    guardRecoveredCases: caseResults.filter((item) => item.guardRecovered).map((item) => item.id),
    cases: caseResults
  };
  const files = writeResults(report);

  console.log('\nRAW MODEL');
  console.log(report.rawMetrics);
  console.log('\nFINAL AFTER INVARIANT');
  console.log(report.finalMetrics);
  console.log(`\nAPI success rate: ${report.api.successRate}%`);
  console.log(`Repeated-run consistency: ${report.repeatedRunConsistency}%`);
  console.log(`Failed cases: ${report.failedCases.join(', ') || 'none'}`);
  console.log(`Unstable cases: ${report.unstableCases.join(', ') || 'none'}`);
  console.log(`Guard recovered cases: ${report.guardRecoveredCases.join(', ') || 'none'}`);
  console.log(`JSON: ${files.jsonPath}`);
  console.log(`CSV: ${files.csvPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Retelling Live Eval failed safely:', error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { RUNS_PER_CASE, SMOKE_CASE_IDS, getRunConfig, writeResults };
