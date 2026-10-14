const fs = require('fs');
const path = require('path');
const cases = require('./retelling-dual-live-cases');
const { evaluateRetellingDual } = require('../cloudfunctions/analyzeSpeech/lib/retelling-dual-evaluator');

const RUNS_PER_CASE = 1;
const SMOKE_CASE_IDS = Object.freeze(['L01', 'L04', 'L07', 'L09', 'L12', 'L14']);

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
  if (!spacedIndexes.length && !inlineValues.length) return RUNS_PER_CASE;
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
    : cases;
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
    repeatIndex
  })));
}

function decisionOf(result) {
  return {
    task: result.taskResult.taskStatus,
    process: result.processResult.processIssue,
    routed: result.routedResult.primaryTrainingNeed
  };
}

function calculateMetrics(caseResults) {
  let successful = 0;
  let taskCorrect = 0;
  let processCorrect = 0;
  let routerCorrect = 0;
  let fullCorrect = 0;
  let falsePass = 0;
  let interventionGold = 0;
  let falseIntervention = 0;
  let passGold = 0;
  let lexicalFalsePositive = 0;
  let lexicalControls = 0;
  caseResults.forEach((item) => item.runs.forEach((run) => {
    if (run.status !== 'SUCCESS') return;
    successful += 1;
    if (run.decision.task === item.gold.task) taskCorrect += 1;
    if (run.decision.process === item.gold.process) processCorrect += 1;
    if (run.decision.routed === item.gold.routed) routerCorrect += 1;
    if (run.decision.task === item.gold.task
      && run.decision.process === item.gold.process
      && run.decision.routed === item.gold.routed) fullCorrect += 1;
    if (item.gold.routed === 'PASS') {
      passGold += 1;
      if (run.decision.routed !== 'PASS') falseIntervention += 1;
    } else {
      interventionGold += 1;
      if (run.decision.routed === 'PASS') falsePass += 1;
    }
    if (item.labels.includes('LEXICAL_FALSE_POSITIVE_CONTROL')) {
      lexicalControls += 1;
      if (run.decision.process === 'LEXICAL_RETRIEVAL') lexicalFalsePositive += 1;
    }
  }));
  return {
    taskContentAccuracy: percent(taskCorrect, successful),
    processAccuracy: percent(processCorrect, successful),
    routerAccuracy: percent(routerCorrect, successful),
    fullDualDecisionAccuracy: percent(fullCorrect, successful),
    falsePassRate: percent(falsePass, interventionGold),
    falseInterventionRate: percent(falseIntervention, passGold),
    lexicalFalsePositiveRate: percent(lexicalFalsePositive, lexicalControls),
    counts: { successful, taskCorrect, processCorrect, routerCorrect, fullCorrect }
  };
}

function calculateRepeatConsistency(caseResults, repeats) {
  function stable(item, signature) {
    const successful = item.runs.filter((run) => run.status === 'SUCCESS');
    return successful.length === item.runs.length
      && new Set(successful.map((run) => signature(run.decision || {}))).size <= 1;
  }
  const taskUnstableCases = caseResults
    .filter((item) => !stable(item, (decision) => decision.task))
    .map((item) => item.id);
  const processUnstableCases = caseResults
    .filter((item) => !stable(item, (decision) => decision.process))
    .map((item) => item.id);
  const routerUnstableCases = caseResults
    .filter((item) => !stable(item, (decision) => decision.routed))
    .map((item) => item.id);
  const fullPipelineUnstableCases = caseResults
    .filter((item) => !stable(item, (decision) => JSON.stringify([
      decision.task,
      decision.process,
      decision.routed
    ])))
    .map((item) => item.id);
  const total = caseResults.length;
  const taskContentConsistency = percent(total - taskUnstableCases.length, total);
  const processConsistency = percent(total - processUnstableCases.length, total);
  const routerConsistency = percent(total - routerUnstableCases.length, total);
  const fullPipelineConsistency = percent(total - fullPipelineUnstableCases.length, total);
  return {
    repeatConsistencyEvaluable: repeats >= 2,
    taskContentConsistency,
    processConsistency,
    routerConsistency,
    fullPipelineConsistency,
    repeatedRunConsistency: routerConsistency,
    taskUnstableCases,
    processUnstableCases,
    routerUnstableCases,
    fullPipelineUnstableCases
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
  const jsonPath = path.join(directory, `retelling-dual-live-eval${suffix}-${time}.json`);
  const csvPath = path.join(directory, `retelling-dual-live-eval${suffix}-summary-${time}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const headers = ['case_id', 'gold_task', 'gold_process', 'gold_routed', 'actual_task', 'actual_process', 'actual_routed', 'status'];
  const rows = report.cases.flatMap((item) => item.runs.map((run) => [
    item.id, item.gold.task, item.gold.process, item.gold.routed,
    run.decision && run.decision.task,
    run.decision && run.decision.process,
    run.decision && run.decision.routed,
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
  console.log(`Planned requests: ${config.plannedRequests}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('Dual Retelling Live Eval stopped: DEEPSEEK_API_KEY is not configured. No API requests were made.');
    process.exitCode = 2;
    return;
  }
  const caseResults = [];
  for (const item of config.cases) {
    const runs = [];
    for (let index = 0; index < config.repeats; index += 1) {
      try {
        const result = await evaluateRetellingDual({ material: item.material, transcript: item.transcript });
        runs.push({
          status: 'SUCCESS',
          decision: decisionOf(result),
          result,
          requestId: result.requestId || ''
        });
      } catch (error) {
        runs.push({ status: 'ERROR', errorType: error && (error.outputErrorType || error.message) });
      }
    }
    caseResults.push(Object.assign({}, item, { runs }));
  }
  const successfulRequests = caseResults.flatMap((item) => item.runs).filter((run) => run.status === 'SUCCESS').length;
  const consistency = calculateRepeatConsistency(caseResults, config.repeats);
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
    metrics: calculateMetrics(caseResults),
    repeatedRunConsistency: consistency.repeatedRunConsistency,
    repeatConsistencyEvaluable: consistency.repeatConsistencyEvaluable,
    taskContentConsistency: consistency.taskContentConsistency,
    processConsistency: consistency.processConsistency,
    routerConsistency: consistency.routerConsistency,
    fullPipelineConsistency: consistency.fullPipelineConsistency,
    taskUnstableCases: consistency.taskUnstableCases,
    processUnstableCases: consistency.processUnstableCases,
    routerUnstableCases: consistency.routerUnstableCases,
    fullPipelineUnstableCases: consistency.fullPipelineUnstableCases,
    cases: caseResults
  };
  const files = writeResults(report);
  console.log(report.metrics);
  console.log(`API success rate: ${report.api.successRate}%`);
  console.log(`Task content consistency: ${report.taskContentConsistency}%`);
  console.log(`Process consistency: ${report.processConsistency}%`);
  console.log(`Router consistency: ${report.routerConsistency}%`);
  console.log(`Full pipeline consistency: ${report.fullPipelineConsistency}%`);
  console.log(`Repeated-run consistency: ${report.repeatedRunConsistency}% (router compatibility alias)`);
  if (!report.repeatConsistencyEvaluable) {
    console.log('Repeat consistency evaluable: false (repeat=1 is not a stability check)');
  }
  console.log(`JSON: ${files.jsonPath}`);
  console.log(`CSV: ${files.csvPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Dual Retelling Live Eval failed safely:', error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  RUNS_PER_CASE,
  SMOKE_CASE_IDS,
  parseRepeat,
  getRunConfig,
  createRunPlan,
  decisionOf,
  calculateMetrics,
  calculateRepeatConsistency,
  writeResults
};
