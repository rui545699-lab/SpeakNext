const { evaluateRetellingContent } = require('./retelling-content-evaluator');
const { analyzeRetellingProcess } = require('./retelling-process-analyzer');
const {
  routeRetellingTraining,
  routeRetellingTrainingV056,
  routeRetellingTrainingV057
} = require('./retelling-training-router');
const {
  analyzeRetellingExpression,
  normalizeTargetRetryEvaluation
} = require('./retelling-expression-analyzer');
const {
  RETELLING_EXPRESSION_PROMPT_VERSION,
  RETELLING_EXPRESSION_SYSTEM_PROMPT
} = require('../config/retelling-expression-prompt');
const {
  RETELLING_CONTENT_PROMPT_VERSION
} = require('../config/retelling-content-prompt');

function transcriptSpan(transcript, value) {
  const source = typeof transcript === 'string' ? transcript : '';
  const text = typeof value === 'string' ? value.trim() : '';
  const start = text ? source.indexOf(text) : -1;
  return start < 0 ? null : { text, start, end: start + text.length };
}

function fallbackConceptTarget(input, taskResult) {
  const relations = Array.isArray(taskResult && taskResult.relations)
    ? taskResult.relations
    : [];
  const incorrectClaims = Array.isArray(taskResult && taskResult.incorrectClaims)
    ? taskResult.incorrectClaims
    : [];
  const relation = relations.find((item) => item && item.status === 'INCORRECT');
  const definition = relation && Array.isArray(input.material && input.material.relations)
    ? input.material.relations.find((item) => item.id === relation.id)
    : null;
  const relationEvidence = relation && relation.relationSpan
    ? transcriptSpan(input.transcript, relation.relationSpan.text)
    : null;
  const groundedClaim = incorrectClaims
    .map((claim) => transcriptSpan(input.transcript, claim && claim.evidence))
    .find(Boolean) || null;
  const coreMessage = input.material && input.material.core_message;
  return {
    detected: true,
    userEvidence: relationEvidence || groundedClaim,
    materialEvidence: coreMessage
      ? { text: coreMessage, start: 0, end: coreMessage.length, field: 'core_message' }
      : null,
    relatedKeyPointIds: definition ? [definition.from, definition.to] : [],
    reasonCode: 'CORE_RELATION_DIRECTION_INCORRECT',
    confidence: 'HIGH'
  };
}

function composeRetellingDualEvaluation(input, taskResult) {
  const processResult = analyzeRetellingProcess({
    transcript: input.transcript,
    material: input.material,
    taskResult
  });
  const routedResult = routeRetellingTraining(taskResult, processResult);
  return { taskResult, processResult, routedResult };
}

async function evaluateRetellingDual(input, request) {
  const content = await evaluateRetellingContent(input, request);
  return Object.assign(
    composeRetellingDualEvaluation(input, content.taskResult),
    {
      rawContentEvaluation: content.rawEvaluation,
      repairedContentEvaluation: content.repairedEvaluation,
      modelVersion: content.modelVersion,
      promptVersion: content.promptVersion,
      requestId: content.requestId,
      retryCount: content.retryCount,
      relationRepairCount: content.relationRepairCount,
      relationRepairIssues: content.relationRepairIssues,
      relationRepairRemainingIssues: content.relationRepairRemainingIssues
    }
  );
}

function composeRetellingV056Evaluation(input, taskResult, rawEvaluation) {
  const legacyProcess = analyzeRetellingProcess({
    transcript: input.transcript,
    material: input.material,
    taskResult
  });
  const expression = analyzeRetellingExpression({
    transcript: input.transcript,
    material: input.material,
    taskResult,
    rawEvaluation,
    retryContext: input.retryContext
  });
  const targetRetryEvaluation = normalizeTargetRetryEvaluation({
    transcript: input.transcript,
    retryContext: input.retryContext,
    rawEvaluation
  });
  const processResult = Object.assign({}, legacyProcess, expression, {
    targetRetryEvaluation,
    legacyProcessIssue: legacyProcess.processIssue,
    processIssue: 'NONE'
  });
  return {
    taskResult,
    processResult,
    routedResult: routeRetellingTrainingV056(taskResult, processResult)
  };
}

async function evaluateRetellingDualV056(input, request) {
  const content = await evaluateRetellingContent(input, request, {
    systemPrompt: RETELLING_EXPRESSION_SYSTEM_PROMPT,
    promptVersion: RETELLING_EXPRESSION_PROMPT_VERSION
  });
  return Object.assign(
    composeRetellingV056Evaluation(input, content.taskResult, content.rawEvaluation),
    {
      rawContentEvaluation: content.rawEvaluation,
      repairedContentEvaluation: content.repairedEvaluation,
      modelVersion: content.modelVersion,
      promptVersion: content.promptVersion,
      requestId: content.requestId,
      retryCount: content.retryCount,
      relationRepairCount: content.relationRepairCount,
      relationRepairIssues: content.relationRepairIssues,
      relationRepairRemainingIssues: content.relationRepairRemainingIssues
    }
  );
}

function composeRetellingV057Evaluation(input, taskResult, rawEvaluation) {
  const legacyProcess = analyzeRetellingProcess({
    transcript: input.transcript,
    material: input.material,
    taskResult
  });
  const expression = analyzeRetellingExpression({
    transcript: input.transcript,
    material: input.material,
    taskResult,
    rawEvaluation,
    retryContext: input.retryContext
  });
  const targetRetryEvaluation = normalizeTargetRetryEvaluation({
    transcript: input.transcript,
    retryContext: input.retryContext,
    rawEvaluation
  });
  const processResult = Object.assign({}, legacyProcess, expression, {
    targetRetryEvaluation,
    legacyProcessIssue: legacyProcess.processIssue,
    processIssue: 'NONE'
  });
  const evaluation = { taskResult, processResult };
  const routedResult = routeRetellingTrainingV057(evaluation.taskResult, evaluation.processResult);
  if (routedResult.primaryTrainingNeed === 'CONCEPT_INACCURACY') {
    const concept = evaluation.taskResult.conceptInaccuracy || {};
    if (concept.detected) {
      routedResult.conceptTarget = concept;
    } else {
      routedResult.conceptTarget = fallbackConceptTarget(input, evaluation.taskResult);
    }
  }
  return Object.assign({}, evaluation, {
    routedResult
  });
}

async function evaluateRetellingDualV057(input, request) {
  const content = await evaluateRetellingContent(input, request, {
    systemPrompt: RETELLING_EXPRESSION_SYSTEM_PROMPT,
    // The one-call prompt still includes the unchanged Expression appendix. This
    // version identifies the active Task calibration applied by the shared base.
    promptVersion: RETELLING_CONTENT_PROMPT_VERSION
  });
  return Object.assign(
    composeRetellingV057Evaluation(input, content.taskResult, content.rawEvaluation),
    {
      rawContentEvaluation: content.rawEvaluation,
      repairedContentEvaluation: content.repairedEvaluation,
      modelVersion: content.modelVersion,
      promptVersion: content.promptVersion,
      requestId: content.requestId,
      retryCount: content.retryCount,
      relationRepairCount: content.relationRepairCount,
      relationRepairIssues: content.relationRepairIssues,
      relationRepairRemainingIssues: content.relationRepairRemainingIssues
    }
  );
}

module.exports = {
  composeRetellingDualEvaluation,
  evaluateRetellingDual,
  composeRetellingV056Evaluation,
  evaluateRetellingDualV056,
  fallbackConceptTarget,
  composeRetellingV057Evaluation,
  evaluateRetellingDualV057
};
