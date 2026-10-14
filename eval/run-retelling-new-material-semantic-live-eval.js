'use strict';

const fs = require('fs');
const path = require('path');
const cases = require('./retelling-new-material-semantic-live-cases');
const { evaluateRetellingDual } = require('../cloudfunctions/analyzeSpeech/lib/retelling-dual-evaluator');

function percent(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function point(result, id) {
  const points = result && result.taskResult && result.taskResult.keyPoints;
  return Array.isArray(points) ? points.find((item) => item.id === id) : null;
}

function evidenceIsGrounded(result, transcript) {
  const task = result && result.taskResult;
  if (!task) return false;
  const pointEvidence = (task.keyPoints || [])
    .filter((item) => item.covered)
    .every((item) => item.evidence && transcript.includes(item.evidence));
  const relationEvidence = (task.relations || []).every((item) => {
    if (!['CORRECT', 'INCORRECT'].includes(item.status)) return true;
    return item.fromEvidence && transcript.includes(item.fromEvidence)
      && item.toEvidence && transcript.includes(item.toEvidence)
      && item.relationEvidence && transcript.includes(item.relationEvidence);
  });
  return pointEvidence && relationEvidence;
}

function calculateMetrics(results) {
  const successful = results.filter((item) => item.status === 'SUCCESS');
  const expectedK3 = successful.filter((item) => item.gold.expectedK3);
  const negative = successful.filter((item) => !item.gold.expectedK3);
  return {
    apiSuccessRate: percent(successful.length, results.length),
    k3CoverageAccuracy: percent(expectedK3.filter((item) => item.actual.k3Covered).length, expectedK3.length),
    falseK3CoverageRate: percent(negative.filter((item) => item.actual.k3Covered).length, negative.length),
    taskAccuracy: percent(successful.filter((item) => item.actual.task === item.gold.task).length, successful.length),
    routedDecisionAccuracy: percent(successful.filter((item) => item.actual.routed === item.gold.routed).length, successful.length),
    evidenceGroundingRate: percent(successful.filter((item) => item.actual.evidenceGrounded).length, successful.length)
  };
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function writeReport(report) {
  const directory = path.join(__dirname, 'results');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `retelling-new-material-semantic-live-smoke-${stamp()}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

async function main() {
  console.log('THIS COMMAND CALLS DEEPSEEK AND MAY INCUR API COST.');
  console.log('Mode: NEW MATERIAL SEMANTIC SMOKE');
  console.log(`Cases: ${cases.length}`);
  console.log(`Planned requests: ${cases.length}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('Semantic coverage smoke stopped: DEEPSEEK_API_KEY is not configured. No API requests were made.');
    process.exitCode = 2;
    return;
  }
  const results = [];
  for (const item of cases) {
    try {
      const result = await evaluateRetellingDual({ material: item.material, transcript: item.transcript });
      results.push({
        id: item.id,
        variant: item.variant,
        transcript: item.transcript,
        gold: item.gold,
        status: 'SUCCESS',
        actual: {
          task: result.taskResult.taskStatus,
          process: result.processResult.processIssue,
          routed: result.routedResult.primaryTrainingNeed,
          k2Covered: Boolean(point(result, 'K2') && point(result, 'K2').covered),
          k3Covered: Boolean(point(result, 'K3') && point(result, 'K3').covered),
          k2Evidence: point(result, 'K2') ? point(result, 'K2').evidence : '',
          k3Evidence: point(result, 'K3') ? point(result, 'K3').evidence : '',
          evidenceGrounded: evidenceIsGrounded(result, item.transcript)
        },
        result
      });
    } catch (error) {
      results.push({ id: item.id, variant: item.variant, transcript: item.transcript, gold: item.gold,
        status: 'ERROR', errorType: error && (error.outputErrorType || error.message) });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    configuration: { mode: 'NEW_MATERIAL_SEMANTIC_SMOKE', caseCount: cases.length, repeats: 1 },
    metrics: calculateMetrics(results),
    cases: results
  };
  const file = writeReport(report);
  console.log(report.metrics);
  console.log(`JSON: ${file}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Semantic coverage smoke failed safely:', error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { cases, point, evidenceIsGrounded, calculateMetrics, writeReport };
