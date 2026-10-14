const {
  callDeepSeek,
  parseEvaluatorResponse,
  MAX_EVALUATOR_RETRIES
} = require('../cloudfunctions/analyzeSpeech/lib/deepseek-evaluator');
const {
  createRetellingPayload,
  validateRetellingEvaluation,
  applyRelationConsistencyRepair
} = require('../cloudfunctions/analyzeSpeech/lib/retelling-evaluator');

const LABELS = Object.freeze([
  'PASS',
  'MISSING_CAUSAL_STEP',
  'INCORRECT_RELATION',
  'INFORMATION_ORDER',
  'LEXICAL_RETRIEVAL',
  'UNCERTAIN'
]);
const RETRYABLE_OUTPUT_ERRORS = new Set([
  'EMPTY_MODEL_OUTPUT',
  'OUTPUT_TRUNCATED',
  'OUTPUT_PARSE_ERROR'
]);

function percent(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function normalizeDecision(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    coreMeaningClear: source.core_meaning_clear === true,
    primaryTrainingNeed: source.primary_training_need || null,
    recommendedAction: source.recommended_action || null
  };
}

function labelFor(decision) {
  return decision && decision.primaryTrainingNeed
    ? decision.primaryTrainingNeed
    : decision && decision.coreMeaningClear && decision.recommendedAction === 'PASS'
      ? 'PASS'
      : 'UNCERTAIN';
}

function decisionMatches(decision, item) {
  return Boolean(decision)
    && decision.coreMeaningClear === item.gold.coreMeaningClear
    && decision.primaryTrainingNeed === item.gold.primaryTrainingNeed
    && decision.recommendedAction === item.gold.recommendedAction;
}

async function runProductionRetelling(item, request = callDeepSeek) {
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const input = { material: item.material, transcript: item.transcript };
  const payload = createRetellingPayload(model, input);
  const attempts = [];
  let retryCount = 0;
  while (retryCount <= MAX_EVALUATOR_RETRIES) {
    try {
      const response = await request(payload);
      const parsed = parseEvaluatorResponse(response);
      const raw = parsed.parsed;
      const repair = await applyRelationConsistencyRepair(model, input, raw, request);
      const final = validateRetellingEvaluation(repair.evaluation, input);
      attempts.push({
        status: 'SUCCESS',
        requestId: parsed.metadata.requestId,
        finishReason: parsed.metadata.finishReason,
        retryCount
      });
      return {
        status: 'SUCCESS',
        raw,
        final,
        rawDecision: normalizeDecision(raw),
        finalDecision: normalizeDecision(final),
        requestId: parsed.metadata.requestId,
        finishReason: parsed.metadata.finishReason,
        retryCount,
        relationRepairCount: repair.repairCount,
        relationRepairIssues: repair.issues,
        relationRepairRemainingIssues: repair.remainingIssues,
        relationRepairRequestId: repair.requestId,
        attempts
      };
    } catch (error) {
      const type = error && (error.outputErrorType || error.message);
      attempts.push({
        status: 'ERROR',
        errorType: type || 'RETELLING_LIVE_EVAL_ERROR',
        requestId: error && error.requestId ? String(error.requestId) : '',
        finishReason: error && error.finishReason ? String(error.finishReason) : '',
        retryCount
      });
      if (RETRYABLE_OUTPUT_ERRORS.has(type) && retryCount < MAX_EVALUATOR_RETRIES) {
        retryCount += 1;
        continue;
      }
      return {
        status: 'ERROR',
        errorType: type || 'RETELLING_LIVE_EVAL_ERROR',
        requestId: error && error.requestId ? String(error.requestId) : '',
        finishReason: error && error.finishReason ? String(error.finishReason) : '',
        retryCount,
        attempts
      };
    }
  }
  return { status: 'ERROR', errorType: 'RETELLING_LIVE_EVAL_ERROR', attempts };
}

function createConfusionMatrix() {
  return LABELS.reduce((matrix, gold) => {
    matrix[gold] = LABELS.reduce((row, predicted) => {
      row[predicted] = 0;
      return row;
    }, {});
    return matrix;
  }, {});
}

function calculateMetrics(records, layer) {
  const matrix = createConfusionMatrix();
  let coreCorrect = 0;
  let needCorrect = 0;
  let actionCorrect = 0;
  let fullCorrect = 0;
  let falseInterventions = 0;
  let passGoldTotal = 0;
  let falsePasses = 0;
  let nonPassGoldTotal = 0;
  let uncertainCorrect = 0;
  let uncertainTotal = 0;
  let lexicalFalsePositives = 0;
  let lexicalControlTotal = 0;

  records.forEach(({ item, run }) => {
    const decision = layer === 'raw' ? run.rawDecision : run.finalDecision;
    if (!decision) return;
    if (decision.coreMeaningClear === item.gold.coreMeaningClear) coreCorrect += 1;
    if (decision.primaryTrainingNeed === item.gold.primaryTrainingNeed) needCorrect += 1;
    if (decision.recommendedAction === item.gold.recommendedAction) actionCorrect += 1;
    if (decisionMatches(decision, item)) fullCorrect += 1;
    const asksTraining = decision.primaryTrainingNeed !== null
      || decision.recommendedAction !== 'PASS'
      || decision.coreMeaningClear !== true;
    const predictsPass = decision.primaryTrainingNeed === null
      && decision.recommendedAction === 'PASS'
      && decision.coreMeaningClear === true;
    if (item.gold.primaryTrainingNeed == null) {
      passGoldTotal += 1;
      if (asksTraining) falseInterventions += 1;
    } else {
      nonPassGoldTotal += 1;
      if (predictsPass) falsePasses += 1;
    }
    if (item.gold.primaryTrainingNeed === 'UNCERTAIN') {
      uncertainTotal += 1;
      if (decision.primaryTrainingNeed === 'UNCERTAIN') uncertainCorrect += 1;
    }
    if (item.labels.includes('LEXICAL_FALSE_POSITIVE_CONTROL')) {
      lexicalControlTotal += 1;
      if (decision.primaryTrainingNeed === 'LEXICAL_RETRIEVAL') lexicalFalsePositives += 1;
    }
    const goldLabel = item.gold.primaryTrainingNeed || 'PASS';
    const predictedLabel = labelFor(decision);
    matrix[goldLabel][predictedLabel] += 1;
  });

  const total = records.length;
  return {
    coreMeaningAccuracy: percent(coreCorrect, total),
    primaryTrainingNeedAccuracy: percent(needCorrect, total),
    recommendedActionAccuracy: percent(actionCorrect, total),
    fullDecisionAccuracy: percent(fullCorrect, total),
    falseInterventionRate: percent(falseInterventions, passGoldTotal),
    falsePassRate: percent(falsePasses, nonPassGoldTotal),
    uncertainAccuracy: percent(uncertainCorrect, uncertainTotal),
    lexicalFalsePositiveRate: percent(lexicalFalsePositives, lexicalControlTotal),
    counts: {
      total,
      coreCorrect,
      needCorrect,
      actionCorrect,
      fullCorrect,
      falseInterventions,
      passGoldTotal,
      falsePasses,
      nonPassGoldTotal,
      uncertainCorrect,
      uncertainTotal,
      lexicalFalsePositives,
      lexicalControlTotal
    },
    confusionMatrix: matrix
  };
}

function classifyCase(item, runs) {
  const successful = runs.filter((run) => run.status === 'SUCCESS');
  const signatures = successful.map((run) => JSON.stringify(run.finalDecision));
  const stable = successful.length === runs.length && new Set(signatures).size <= 1;
  const rawRecovered = successful.some((run) => !decisionMatches(run.rawDecision, item)
    && decisionMatches(run.finalDecision, item));
  return {
    stable,
    guardRecovered: rawRecovered,
    failed: successful.length !== runs.length
      || successful.some((run) => !decisionMatches(run.finalDecision, item))
  };
}

module.exports = {
  LABELS,
  percent,
  normalizeDecision,
  labelFor,
  decisionMatches,
  runProductionRetelling,
  calculateMetrics,
  classifyCase
};
