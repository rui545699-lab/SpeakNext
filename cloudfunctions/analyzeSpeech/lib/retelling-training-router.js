const ROUTED_NEEDS = Object.freeze([
  'PASS',
  'MISSING_CAUSAL_STEP',
  'INCORRECT_RELATION',
  'LEXICAL_RETRIEVAL',
  'INFORMATION_ORDER',
  'UNCERTAIN',
  'WORDING_PRECISION',
  'FORMULATION_BREAKDOWN',
  'CONCEPT_INACCURACY'
]);
const ACTION_BY_NEED = Object.freeze({
  PASS: 'PASS',
  MISSING_CAUSAL_STEP: 'ADD_CAUSAL_LINK',
  INCORRECT_RELATION: 'RETHINK_RELATION',
  LEXICAL_RETRIEVAL: 'PARAPHRASE_AROUND_WORD',
  INFORMATION_ORDER: 'REORDER_CAUSAL_CHAIN',
  UNCERTAIN: 'OBSERVE_AGAIN',
  WORDING_PRECISION: 'REFINE_WORDING',
  FORMULATION_BREAKDOWN: 'COMPLETE_FORMULATION',
  CONCEPT_INACCURACY: 'CORRECT_CONCEPT'
});
const RETRY_SCOPES = Object.freeze({
  FULL_CONTENT: 'FULL_CONTENT',
  TARGET_EXPRESSION: 'TARGET_EXPRESSION'
});
const RETRY_SCOPE_BY_NEED = Object.freeze({
  PASS: null,
  MISSING_CAUSAL_STEP: RETRY_SCOPES.FULL_CONTENT,
  INCORRECT_RELATION: RETRY_SCOPES.FULL_CONTENT,
  LEXICAL_RETRIEVAL: RETRY_SCOPES.FULL_CONTENT,
  INFORMATION_ORDER: RETRY_SCOPES.FULL_CONTENT,
  UNCERTAIN: RETRY_SCOPES.FULL_CONTENT,
  WORDING_PRECISION: RETRY_SCOPES.TARGET_EXPRESSION,
  FORMULATION_BREAKDOWN: RETRY_SCOPES.TARGET_EXPRESSION,
  CONCEPT_INACCURACY: RETRY_SCOPES.FULL_CONTENT
});
const ACTIONABLE_FORMULATION_REASONS = new Set([
  'WORD_SEARCH_INTERRUPTION',
  'CLAUSE_FORMATION_INTERRUPTED'
]);

function routed(primaryTrainingNeed, sourceLayer, ruleId, evidence) {
  return {
    primaryTrainingNeed,
    recommendedAction: ACTION_BY_NEED[primaryTrainingNeed],
    retryScope: RETRY_SCOPE_BY_NEED[primaryTrainingNeed],
    sourceLayer,
    ruleId,
    evidence: Array.isArray(evidence) ? evidence : []
  };
}

function hasGroundedSpan(span) {
  return Boolean(span && typeof span.text === 'string' && span.text.trim()
    && Number.isInteger(span.start) && Number.isInteger(span.end)
    && span.start >= 0 && span.end > span.start);
}

function isMaterialBoundExpression(processResult) {
  const relatedIds = Array.isArray(processResult && processResult.relatedKeyPointIds)
    ? processResult.relatedKeyPointIds
    : [];
  const materialEvidence = processResult && processResult.materialEvidence;
  if (!relatedIds.length || !hasGroundedSpan(materialEvidence)) return false;
  const field = typeof materialEvidence.field === 'string' ? materialEvidence.field : '';
  const match = /^key_points\.(K\d+)(?:\.text)?$/.exec(field);
  return Boolean(match && relatedIds.includes(match[1]));
}

function canOverrideUncertainWithFormulation(taskResult, processResult) {
  const relations = Array.isArray(taskResult && taskResult.relations) ? taskResult.relations : [];
  const concept = (taskResult && taskResult.conceptInaccuracy) || {};
  const incorrectClaims = Array.isArray(taskResult && taskResult.incorrectClaims)
    ? taskResult.incorrectClaims
    : [];
  return Boolean(
    taskResult && taskResult.taskStatus === 'UNCERTAIN'
    && processResult && processResult.expressionIssue === 'FORMULATION_BREAKDOWN'
    && processResult.confidence === 'HIGH'
    && ACTIONABLE_FORMULATION_REASONS.has(processResult.reasonCode)
    && hasGroundedSpan(processResult.userEvidence)
    && isMaterialBoundExpression(processResult)
    && concept.detected !== true
    && incorrectClaims.length === 0
    && !relations.some((relation) => relation && relation.status === 'INCORRECT')
  );
}

function routeRetellingTraining(taskResult, processResult) {
  if (!taskResult || !processResult) throw new Error('RETELLING_ROUTER_INPUT_INVALID');
  const task = taskResult.taskStatus;
  const process = processResult.processIssue;

  if (task === 'INCORRECT_RELATION') {
    const relation = (taskResult.relations || []).find((item) => item.status === 'INCORRECT');
    return routed('INCORRECT_RELATION', 'TASK', 'ROUTE_INCORRECT_RELATION_PRIORITY', relation
      ? [{ text: relation.relationEvidence, type: 'incorrect_relation' }]
      : []);
  }

  if (process === 'LEXICAL_RETRIEVAL') {
    const ruleId = task === 'MISSING_CORE_CONTENT'
      ? 'ROUTE_EXPLICIT_LEXICAL_OVER_MISSING_CORE'
      : task === 'UNCERTAIN'
        ? 'ROUTE_GROUNDED_LEXICAL_OVER_UNCERTAIN'
        : 'ROUTE_PROCESS_LEXICAL';
    return routed('LEXICAL_RETRIEVAL', 'PROCESS', ruleId, processResult.evidence);
  }

  if (process === 'INFORMATION_ORDER'
    && (task === 'PASS' || task === 'RELATION_NOT_ESTABLISHED')) {
    return routed('INFORMATION_ORDER', 'PROCESS', task === 'PASS'
      ? 'ROUTE_ORDER_AFTER_CONTENT_PASS'
      : 'ROUTE_ORDER_EXPLAINS_UNESTABLISHED_RELATION', processResult.evidence);
  }

  if (task === 'MISSING_CORE_CONTENT') {
    return routed('MISSING_CAUSAL_STEP', 'TASK', 'ROUTE_MISSING_CORE_CONTENT', []);
  }
  if (task === 'RELATION_NOT_ESTABLISHED') {
    return routed('MISSING_CAUSAL_STEP', 'TASK', 'ROUTE_RELATION_NEEDS_CAUSAL_LINK', []);
  }
  if (task === 'UNCERTAIN') {
    return routed('UNCERTAIN', 'TASK', 'ROUTE_TASK_UNCERTAIN', []);
  }
  if (task === 'PASS') return routed('PASS', 'NONE', 'ROUTE_PASS', []);
  throw new Error('RETELLING_ROUTER_TASK_STATUS_INVALID');
}

function routeRetellingTrainingV056(taskResult, processResult) {
  if (!taskResult || !processResult) throw new Error('RETELLING_ROUTER_INPUT_INVALID');
  const task = taskResult.taskStatus;
  const expression = processResult.expressionIssue || 'NONE';
  const userEvidence = processResult.userEvidence;
  const relatedIds = Array.isArray(processResult.relatedKeyPointIds)
    ? processResult.relatedKeyPointIds
    : [];
  const groundedUserEvidence = Boolean(userEvidence && userEvidence.text
    && Number.isInteger(userEvidence.start) && Number.isInteger(userEvidence.end)
    && userEvidence.start >= 0 && userEvidence.end > userEvidence.start);

  if (task === 'INCORRECT_RELATION') {
    const relation = (taskResult.relations || []).find((item) => item.status === 'INCORRECT');
    return routed('INCORRECT_RELATION', 'TASK', 'ROUTE_INCORRECT_RELATION_PRIORITY', relation
      ? [{ text: relation.relationEvidence, type: 'incorrect_relation' }]
      : []);
  }
  if (task === 'MISSING_CORE_CONTENT' || task === 'RELATION_NOT_ESTABLISHED') {
    return routed('MISSING_CAUSAL_STEP', 'TASK', task === 'MISSING_CORE_CONTENT'
      ? 'ROUTE_MISSING_CORE_CONTENT'
      : 'ROUTE_RELATION_NEEDS_CAUSAL_LINK', []);
  }
  if (task === 'UNCERTAIN') {
    return routed('UNCERTAIN', 'TASK', 'ROUTE_TASK_UNCERTAIN', []);
  }
  if (task !== 'PASS') throw new Error('RETELLING_ROUTER_TASK_STATUS_INVALID');

  if (expression === 'WORDING_PRECISION'
    && groundedUserEvidence
    && processResult.materialEvidence
    && processResult.materialEvidence.text
    && relatedIds.length) {
    return routed('WORDING_PRECISION', 'EXPRESSION', 'ROUTE_GROUNDED_WORDING_PRECISION', [
      { text: processResult.userEvidence.text, type: 'wording_precision' }
    ]);
  }
  if (expression === 'FORMULATION_BREAKDOWN' && groundedUserEvidence && relatedIds.length) {
    return routed('FORMULATION_BREAKDOWN', 'EXPRESSION', 'ROUTE_GROUNDED_FORMULATION_BREAKDOWN', [
      { text: processResult.userEvidence.text, type: 'formulation_breakdown' }
    ]);
  }
  return routed('PASS', 'NONE', 'ROUTE_PASS', []);
}

function routeRetellingTrainingV057(taskResult, processResult) {
  if (!taskResult || !processResult) throw new Error('RETELLING_ROUTER_INPUT_INVALID');
  const task = taskResult.taskStatus;
  const concept = taskResult.conceptInaccuracy || {};
  if (task === 'INCORRECT_RELATION' || task === 'CONCEPT_INACCURACY') {
    const relation = (taskResult.relations || []).find((item) => item.status === 'INCORRECT');
    const incorrectClaim = (taskResult.incorrectClaims || []).find((item) => item && item.evidence);
    const evidence = concept.detected && concept.userEvidence
      ? [{ text: concept.userEvidence.text, type: 'concept_inaccuracy' }]
      : relation && relation.relationEvidence
        ? [{ text: relation.relationEvidence, type: 'incorrect_relation' }]
        : incorrectClaim
          ? [{ text: incorrectClaim.evidence, type: 'incorrect_claim' }]
          : [];
    return routed('CONCEPT_INACCURACY', 'TASK', task === 'INCORRECT_RELATION'
      ? 'ROUTE_CONTENT_RELATION_AS_CONCEPT'
      : 'ROUTE_GROUNDED_CONCEPT_INACCURACY', evidence);
  }
  if (task === 'MISSING_CORE_CONTENT' || task === 'RELATION_NOT_ESTABLISHED') {
    return routed('MISSING_CAUSAL_STEP', 'TASK', task === 'MISSING_CORE_CONTENT'
      ? 'ROUTE_MISSING_CORE_CONTENT'
      : 'ROUTE_RELATION_NEEDS_CAUSAL_LINK', []);
  }
  if (task === 'UNCERTAIN') {
    if (canOverrideUncertainWithFormulation(taskResult, processResult)) {
      return routed(
        'FORMULATION_BREAKDOWN',
        'EXPRESSION',
        'ROUTE_GROUNDED_FORMULATION_OVER_UNCERTAIN',
        [{ text: processResult.userEvidence.text, type: 'formulation_breakdown' }]
      );
    }
    return routed('UNCERTAIN', 'TASK', 'ROUTE_TASK_UNCERTAIN', []);
  }
  if (task !== 'PASS') throw new Error('RETELLING_ROUTER_TASK_STATUS_INVALID');
  return routeRetellingTrainingV056(taskResult, processResult);
}

module.exports = {
  ROUTED_NEEDS,
  ACTION_BY_NEED,
  RETRY_SCOPES,
  RETRY_SCOPE_BY_NEED,
  canOverrideUncertainWithFormulation,
  routeRetellingTraining,
  routeRetellingTrainingV056,
  routeRetellingTrainingV057
};
