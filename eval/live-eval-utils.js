const {
  callDeepSeek,
  createEvaluatorPayload,
  parseEvaluatorResponse,
  validateDiagnosis,
  getSafeHealthcheckDetails,
  MAX_EVALUATOR_RETRIES
} = require('../cloudfunctions/analyzeSpeech/lib/deepseek-evaluator');

const RETRYABLE_OUTPUT_ERRORS = new Set([
  'EMPTY_MODEL_OUTPUT',
  'OUTPUT_TRUNCATED',
  'OUTPUT_PARSE_ERROR'
]);

const ISSUE_LABELS = [
  'CONTENT_START',
  'CONTENT_EXPAND',
  'LEXICAL_RETRIEVAL',
  'INFORMATION_ORDER',
  'UNCERTAIN',
  'NONE'
];

function createProductionInput(item) {
  return {
    question_id: item.question.id,
    question_text: item.question.text,
    question_category: item.question.category,
    question_openness: item.question.openness || 'MEDIUM',
    question_task_type: item.question.taskType,
    question_required_slots: item.question.requiredSlots,
    transcript: item.transcript,
    signals: item.signals
  };
}

function normalizeDecision(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    questionApplicable: source.question_applicable === true,
    needsIntervention: source.needs_intervention === true,
    primaryIssue: source.primary_issue || null,
    recommendedIntervention: source.recommended_intervention || null
  };
}

function decisionMatches(decision, item) {
  const acceptableIssues = item.acceptablePrimaryIssues && item.acceptablePrimaryIssues.length
    ? item.acceptablePrimaryIssues
    : [item.gold.primaryIssue];
  return decision.questionApplicable === item.gold.questionApplicable
    && decision.needsIntervention === item.gold.needsIntervention
    && acceptableIssues.includes(decision.primaryIssue)
    && decision.recommendedIntervention === item.gold.recommendedIntervention;
}

function issueMatches(decision, item) {
  const acceptableIssues = item.acceptablePrimaryIssues && item.acceptablePrimaryIssues.length
    ? item.acceptablePrimaryIssues
    : [item.gold.primaryIssue];
  return acceptableIssues.includes(decision.primaryIssue);
}

async function runProductionDiagnosis(item) {
  const input = createProductionInput(item);
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const payload = createEvaluatorPayload(model, input);
  const attempts = [];

  for (let retryCount = 0; retryCount <= MAX_EVALUATOR_RETRIES; retryCount += 1) {
    try {
      const response = await callDeepSeek(payload);
      const parsed = parseEvaluatorResponse(response);
      attempts.push({
        requestId: parsed.metadata.requestId,
        finishReason: parsed.metadata.finishReason,
        retryCount,
        status: 'SUCCESS'
      });
      let final;
      try {
        final = validateDiagnosis(parsed.parsed, input);
      } catch (error) {
        return {
          status: 'GUARD_ERROR',
          raw: parsed.parsed,
          rawDecision: normalizeDecision(parsed.parsed),
          guardError: error && error.message ? String(error.message) : 'DIAGNOSIS_GUARD_ERROR',
          requestId: parsed.metadata.requestId,
          finishReason: parsed.metadata.finishReason,
          retryCount,
          attempts
        };
      }
      return {
        status: 'SUCCESS',
        raw: parsed.parsed,
        final,
        rawDecision: normalizeDecision(parsed.parsed),
        finalDecision: normalizeDecision(final),
        requestId: parsed.metadata.requestId,
        finishReason: parsed.metadata.finishReason,
        retryCount,
        attempts
      };
    } catch (error) {
      const errorType = error && (error.outputErrorType || error.message)
        ? String(error.outputErrorType || error.message)
        : 'UNKNOWN_ERROR';
      attempts.push({
        requestId: error && error.requestId ? String(error.requestId) : '',
        finishReason: error && error.finishReason ? String(error.finishReason) : '',
        retryCount,
        status: 'ERROR',
        errorType
      });
      if (RETRYABLE_OUTPUT_ERRORS.has(errorType) && retryCount < MAX_EVALUATOR_RETRIES) continue;
      const details = getSafeHealthcheckDetails(error);
      return {
        status: 'API_ERROR',
        errorType: details.errorType,
        providerCode: details.providerCode,
        providerMessage: details.providerMessage,
        requestId: error && error.requestId ? String(error.requestId) : '',
        finishReason: error && error.finishReason ? String(error.finishReason) : '',
        retryCount,
        attempts
      };
    }
  }
  return { status: 'API_ERROR', errorType: 'RETRY_EXHAUSTED', attempts };
}

function emptyConfusionMatrix() {
  return ISSUE_LABELS.reduce((matrix, gold) => {
    matrix[gold] = ISSUE_LABELS.reduce((row, predicted) => {
      row[predicted] = 0;
      return row;
    }, {});
    return matrix;
  }, {});
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

function calculateLayerMetrics(successfulRuns, layer) {
  const key = layer === 'raw' ? 'rawDecision' : 'finalDecision';
  let applicabilityCorrect = 0;
  let needsCorrect = 0;
  let primaryCorrect = 0;
  let primaryTotal = 0;
  let interventionCorrect = 0;
  let fullCorrect = 0;
  let falseInterventions = 0;
  let falseInterventionTotal = 0;
  let missedInterventions = 0;
  let missedInterventionTotal = 0;
  const confusion = emptyConfusionMatrix();

  successfulRuns.forEach(({ item, run }) => {
    const decision = run[key];
    if (decision.questionApplicable === item.gold.questionApplicable) applicabilityCorrect += 1;
    if (decision.needsIntervention === item.gold.needsIntervention) needsCorrect += 1;
    if (item.gold.needsIntervention) {
      primaryTotal += 1;
      if (issueMatches(decision, item)) primaryCorrect += 1;
    }
    if (decision.recommendedIntervention === item.gold.recommendedIntervention) interventionCorrect += 1;
    if (decisionMatches(decision, item)) fullCorrect += 1;
    if (!item.gold.needsIntervention) {
      falseInterventionTotal += 1;
      if (decision.needsIntervention) falseInterventions += 1;
    }
    if (item.gold.needsIntervention) {
      missedInterventionTotal += 1;
      if (!decision.needsIntervention) missedInterventions += 1;
    }
    const goldIssue = item.gold.primaryIssue || 'NONE';
    const predictedIssue = decision.primaryIssue || 'NONE';
    if (confusion[goldIssue] && confusion[goldIssue][predictedIssue] !== undefined) {
      confusion[goldIssue][predictedIssue] += 1;
    }
  });

  const total = successfulRuns.length;
  return {
    questionApplicabilityAccuracy: percent(applicabilityCorrect, total),
    needsInterventionAccuracy: percent(needsCorrect, total),
    primaryIssueAccuracy: percent(primaryCorrect, primaryTotal),
    recommendedInterventionAccuracy: percent(interventionCorrect, total),
    falseInterventionRate: percent(falseInterventions, falseInterventionTotal),
    missedInterventionRate: percent(missedInterventions, missedInterventionTotal),
    fullDecisionAccuracy: percent(fullCorrect, total),
    counts: {
      total,
      applicabilityCorrect,
      needsCorrect,
      primaryCorrect,
      primaryTotal,
      interventionCorrect,
      fullCorrect,
      falseInterventions,
      falseInterventionTotal,
      missedInterventions,
      missedInterventionTotal
    },
    confusionMatrix: confusion
  };
}

function classifyCase(item, runs) {
  const successful = runs.filter((run) => run.status === 'SUCCESS');
  const labels = new Set();
  successful.forEach((run) => {
    const final = run.finalDecision;
    if (final.questionApplicable !== item.gold.questionApplicable) labels.add('APPLICABILITY_ERROR');
    if (!item.gold.needsIntervention && final.needsIntervention) labels.add('OVER_INTERVENTION');
    if (item.gold.needsIntervention && !final.needsIntervention) labels.add('MISSED_INTERVENTION');
    if (item.gold.needsIntervention && final.needsIntervention && !issueMatches(final, item)) {
      labels.add('WRONG_PRIMARY_ISSUE');
    }
    if (!decisionMatches(run.rawDecision, item) && decisionMatches(final, item)) {
      labels.add('GUARD_RECOVERED');
    }
  });
  const issueValues = successful.map((run) => run.finalDecision.primaryIssue || 'NONE');
  const stable = successful.length === runs.length && new Set(issueValues).size === 1;
  if (!stable) labels.add('UNSTABLE');
  if (runs.some((run) => run.status === 'API_ERROR')) labels.add('API_ERROR');
  if (runs.some((run) => run.status === 'GUARD_ERROR')) labels.add('GUARD_ERROR');
  return { labels: Array.from(labels), stable };
}

function confusionMatrixText(matrix) {
  const short = {
    CONTENT_START: 'START', CONTENT_EXPAND: 'EXPAND', LEXICAL_RETRIEVAL: 'LEXICAL',
    INFORMATION_ORDER: 'ORDER', UNCERTAIN: 'UNCERTAIN', NONE: 'NONE'
  };
  const header = ['Gold\\Pred'].concat(ISSUE_LABELS.map((item) => short[item])).join('\t');
  const rows = ISSUE_LABELS.map((gold) => [short[gold]]
    .concat(ISSUE_LABELS.map((predicted) => matrix[gold][predicted]))
    .join('\t'));
  return [header].concat(rows).join('\n');
}

module.exports = {
  ISSUE_LABELS,
  createProductionInput,
  normalizeDecision,
  decisionMatches,
  issueMatches,
  runProductionDiagnosis,
  calculateLayerMetrics,
  classifyCase,
  confusionMatrixText,
  percent
};
