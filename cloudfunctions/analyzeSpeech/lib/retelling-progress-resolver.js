'use strict';

const TRAINING_NEEDS = Object.freeze({
  MISSING_CAUSAL_STEP: 'MISSING_CAUSAL_STEP',
  INCORRECT_RELATION: 'INCORRECT_RELATION',
  LEXICAL_RETRIEVAL: 'LEXICAL_RETRIEVAL',
  INFORMATION_ORDER: 'INFORMATION_ORDER',
  UNCERTAIN: 'UNCERTAIN',
  WORDING_PRECISION: 'WORDING_PRECISION',
  FORMULATION_BREAKDOWN: 'FORMULATION_BREAKDOWN',
  CONCEPT_INACCURACY: 'CONCEPT_INACCURACY'
});

const TASK_STATUS = Object.freeze({
  PASS: 'PASS',
  MISSING_CORE_CONTENT: 'MISSING_CORE_CONTENT',
  RELATION_NOT_ESTABLISHED: 'RELATION_NOT_ESTABLISHED',
  INCORRECT_RELATION: 'INCORRECT_RELATION',
  CONCEPT_INACCURACY: 'CONCEPT_INACCURACY',
  UNCERTAIN: 'UNCERTAIN'
});

const PROCESS_ISSUE = Object.freeze({
  NONE: 'NONE',
  LEXICAL_RETRIEVAL: 'LEXICAL_RETRIEVAL',
  INFORMATION_ORDER: 'INFORMATION_ORDER'
});
const RETRY_SCOPES = Object.freeze({
  FULL_CONTENT: 'FULL_CONTENT',
  TARGET_EXPRESSION: 'TARGET_EXPRESSION'
});

function retryScopeForNeed(need) {
  return [TRAINING_NEEDS.WORDING_PRECISION, TRAINING_NEEDS.FORMULATION_BREAKDOWN].includes(need)
    ? RETRY_SCOPES.TARGET_EXPRESSION
    : RETRY_SCOPES.FULL_CONTENT;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getKeyPoint(roundResult, id) {
  const keyPoints = roundResult && roundResult.taskResult && roundResult.taskResult.keyPoints;
  return Array.isArray(keyPoints) ? keyPoints.find((item) => item && item.id === id) || null : null;
}

function getRelation(roundResult, id) {
  const relations = roundResult && roundResult.taskResult && roundResult.taskResult.relations;
  return Array.isArray(relations) ? relations.find((item) => item && item.id === id) || null : null;
}

function hasGroundedPoint(point) {
  return Boolean(
    point
    && point.covered === true
    && normalizeText(point.evidence)
    && Number.isInteger(point.start)
    && Number.isInteger(point.end)
    && point.start >= 0
    && point.end > point.start
  );
}

function hasGroundedSpan(text, span) {
  return Boolean(
    normalizeText(text)
    && span
    && normalizeText(span.text) === normalizeText(text)
    && Number.isInteger(span.start)
    && Number.isInteger(span.end)
    && span.start >= 0
    && span.end > span.start
  );
}

function hasStoredGroundedSpan(span) {
  return Boolean(
    span
    && normalizeText(span.text)
    && Number.isInteger(span.start)
    && Number.isInteger(span.end)
    && span.start >= 0
    && span.end > span.start
  );
}

function hasGroundedRelation(relation) {
  return Boolean(
    relation
    && hasGroundedSpan(relation.fromEvidence, relation.fromSpan)
    && hasGroundedSpan(relation.toEvidence, relation.toSpan)
    && hasGroundedSpan(relation.relationEvidence, relation.relationSpan)
  );
}

function hasGroundedIncorrectClaim(roundResult) {
  const claims = roundResult && roundResult.taskResult && roundResult.taskResult.incorrectClaims;
  return Array.isArray(claims) && claims.some((claim) => {
    if (!claim) return false;
    if (typeof claim === 'string') return false;
    return Boolean(
      normalizeText(claim.evidence || claim.text || claim.claim)
      && Number.isInteger(claim.start)
      && Number.isInteger(claim.end)
      && claim.start >= 0
      && claim.end > claim.start
    );
  });
}

function hasCoreChain(roundResult) {
  const k2 = getKeyPoint(roundResult, 'K2');
  const k3 = getKeyPoint(roundResult, 'K3');
  const r2 = getRelation(roundResult, 'R2');
  return hasGroundedPoint(k2)
    && hasGroundedPoint(k3)
    && Boolean(r2 && r2.status === 'CORRECT' && hasGroundedRelation(r2))
    && !hasGroundedIncorrectClaim(roundResult);
}

function hasAnyGroundedRelevantPoint(roundResult) {
  const keyPoints = roundResult && roundResult.taskResult && roundResult.taskResult.keyPoints;
  if (Array.isArray(keyPoints) && keyPoints.some(hasGroundedPoint)) return true;

  const relations = roundResult && roundResult.taskResult && roundResult.taskResult.relations;
  return Array.isArray(relations) && relations.some((relation) => {
    if (!relation) return false;
    return hasGroundedSpan(relation.fromEvidence, relation.fromSpan)
      || hasGroundedSpan(relation.toEvidence, relation.toSpan)
      || hasGroundedSpan(relation.relationEvidence, relation.relationSpan);
  });
}

function firstText(values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstText(value);
      if (nested) return nested;
      continue;
    }
    if (value && typeof value === 'object') {
      const nested = normalizeText(value.text || value.evidence);
      if (nested) return nested;
      continue;
    }
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function groundedKeyPointEvidence(roundResult, ids) {
  for (const id of ids) {
    const point = getKeyPoint(roundResult, id);
    if (hasGroundedPoint(point)) return normalizeText(point.evidence);
  }
  return '';
}

function groundedRelationEvidence(roundResult, id) {
  const relation = getRelation(roundResult, id);
  if (!relation || !hasGroundedRelation(relation)) return '';
  return normalizeText(relation.relationEvidence);
}

function groundedConceptCorrectionEvidence(firstRoundResult, secondRoundResult, concept) {
  const ids = Array.isArray(concept && concept.relatedKeyPointIds)
    ? concept.relatedKeyPointIds
    : [];
  if (ids.length <= 1) return groundedKeyPointEvidence(secondRoundResult, ids);
  const firstRelations = firstRoundResult && firstRoundResult.taskResult
    && firstRoundResult.taskResult.relations;
  const originalRelation = Array.isArray(firstRelations)
    ? firstRelations.find((item) => item && item.status === 'INCORRECT'
      && hasGroundedRelation(item))
    : null;
  if (!originalRelation) return '';
  const correctedRelation = getRelation(secondRoundResult, originalRelation.id);
  return correctedRelation && correctedRelation.status === 'CORRECT'
    && hasGroundedRelation(correctedRelation)
    ? normalizeText(correctedRelation.relationEvidence)
    : '';
}

function groundedIncorrectEvidence(roundResult) {
  const claims = roundResult && roundResult.taskResult && roundResult.taskResult.incorrectClaims;
  if (!Array.isArray(claims)) return '';
  for (const claim of claims) {
    if (
      claim
      && normalizeText(claim.evidence || claim.text || claim.claim)
      && Number.isInteger(claim.start)
      && Number.isInteger(claim.end)
      && claim.start >= 0
      && claim.end > claim.start
    ) {
      return normalizeText(claim.evidence || claim.text || claim.claim);
    }
  }
  return '';
}

function expressionOf(roundResult) {
  const process = (roundResult && roundResult.processResult) || {};
  return {
    issue: process.expressionIssue || 'NONE',
    userEvidence: process.userEvidence || null,
    materialEvidence: process.materialEvidence || null,
    relatedKeyPointIds: Array.isArray(process.relatedKeyPointIds)
      ? process.relatedKeyPointIds
      : [],
    reasonCode: process.reasonCode || '',
    targetRetryEvaluation: process.targetRetryEvaluation || null
  };
}

function conceptOf(roundResult) {
  const concept = (roundResult && roundResult.routedResult && roundResult.routedResult.conceptTarget)
    || (roundResult && roundResult.taskResult && roundResult.taskResult.conceptInaccuracy);
  return {
    detected: Boolean(concept && concept.detected),
    userEvidence: concept && concept.userEvidence ? concept.userEvidence : null,
    materialEvidence: concept && concept.materialEvidence ? concept.materialEvidence : null,
    relatedKeyPointIds: Array.isArray(concept && concept.relatedKeyPointIds)
      ? concept.relatedKeyPointIds
      : [],
    reasonCode: concept && concept.reasonCode ? concept.reasonCode : ''
  };
}

function sameTargetIds(left, right) {
  const rightIds = new Set(right);
  return left.some((id) => rightIds.has(id));
}

function relatedContentPreserved(roundResult, ids) {
  return ids.length > 0 && ids.every((id) => hasGroundedPoint(getKeyPoint(roundResult, id)));
}

function groundedTargetRetryEvaluation(roundResult) {
  const transcript = normalizeText(roundResult && roundResult.transcript);
  const evaluation = roundResult && roundResult.processResult
    && roundResult.processResult.targetRetryEvaluation;
  if (!evaluation || evaluation.applicable !== true) return null;
  if (![true, false, 'UNCERTAIN'].includes(evaluation.targetRetained)) return null;
  const evidence = evaluation.targetEvidence;
  if (evaluation.targetRetained !== 'UNCERTAIN' || evaluation.meaningChanged === true) {
    if (!evidence
      || !normalizeText(evidence.text)
      || !Number.isInteger(evidence.start)
      || !Number.isInteger(evidence.end)
      || evidence.start < 0
      || evidence.end <= evidence.start
      || transcript.slice(evidence.start, evidence.end) !== evidence.text) {
      return null;
    }
  }
  return evaluation;
}

function selectProgressEvidence({
  originalTrainingNeed,
  originalExpressionTarget,
  firstRoundResult,
  secondRoundResult
}) {
  const firstProcess = (firstRoundResult && firstRoundResult.processResult) || {};
  const secondProcess = (secondRoundResult && secondRoundResult.processResult) || {};
  const firstMarkers = Array.isArray(firstProcess.lexicalMarkers) ? firstProcess.lexicalMarkers : [];
  const firstMarker = firstMarkers.find((marker) => marker
    && normalizeText(marker.text)
    && Number.isInteger(marker.start)
    && Number.isInteger(marker.end)
    && marker.start >= 0
    && marker.end > marker.start);
  const firstRouteEvidence = firstRoundResult
    && firstRoundResult.routedResult
    && firstRoundResult.routedResult.evidence;

  switch (originalTrainingNeed) {
    case TRAINING_NEEDS.MISSING_CAUSAL_STEP:
      return {
        beforeEvidence: firstText([
          groundedKeyPointEvidence(firstRoundResult, ['K2', 'K3']),
          firstRouteEvidence
        ]),
        afterEvidence: groundedRelationEvidence(secondRoundResult, 'R2')
      };

    case TRAINING_NEEDS.INCORRECT_RELATION:
      return {
        beforeEvidence: firstText([
          groundedIncorrectEvidence(firstRoundResult),
          groundedRelationEvidence(firstRoundResult, 'R2'),
          firstRouteEvidence
        ]),
        afterEvidence: groundedRelationEvidence(secondRoundResult, 'R2')
      };

    case TRAINING_NEEDS.LEXICAL_RETRIEVAL:
      return {
        beforeEvidence: firstText([
          firstMarker && firstMarker.text,
          firstProcess.evidence,
          firstRouteEvidence
        ]),
        afterEvidence: firstText([
          groundedRelationEvidence(secondRoundResult, 'R2'),
          groundedKeyPointEvidence(secondRoundResult, ['K2', 'K3'])
        ])
      };

    case TRAINING_NEEDS.INFORMATION_ORDER:
      return {
        beforeEvidence: firstText([firstProcess.evidence, firstRouteEvidence]),
        afterEvidence: firstText([
          groundedRelationEvidence(secondRoundResult, 'R2'),
          groundedKeyPointEvidence(secondRoundResult, ['K2', 'K3'])
        ])
      };

    case TRAINING_NEEDS.WORDING_PRECISION:
    case TRAINING_NEEDS.FORMULATION_BREAKDOWN: {
      const firstExpression = originalExpressionTarget || expressionOf(firstRoundResult);
      const secondExpression = expressionOf(secondRoundResult);
      const targetRetryEvaluation = groundedTargetRetryEvaluation(secondRoundResult);
      return {
        beforeEvidence: firstText([firstExpression.userEvidence]),
        afterEvidence: firstText([
          targetRetryEvaluation && targetRetryEvaluation.targetEvidence,
          groundedKeyPointEvidence(secondRoundResult, firstExpression.relatedKeyPointIds),
          secondExpression.issue === originalTrainingNeed
            && sameTargetIds(firstExpression.relatedKeyPointIds, secondExpression.relatedKeyPointIds)
            ? secondExpression.userEvidence
            : null
        ])
      };
    }

    case TRAINING_NEEDS.CONCEPT_INACCURACY: {
      const firstConcept = conceptOf(firstRoundResult);
      const secondConcept = conceptOf(secondRoundResult);
      return {
        beforeEvidence: firstText([firstConcept.userEvidence]),
        afterEvidence: firstText([
          secondConcept.detected ? secondConcept.userEvidence : null,
          groundedConceptCorrectionEvidence(firstRoundResult, secondRoundResult, firstConcept),
          groundedKeyPointEvidence(secondRoundResult, firstConcept.relatedKeyPointIds)
        ])
      };
    }

    case TRAINING_NEEDS.UNCERTAIN:
    default:
      return {
        beforeEvidence: firstText([firstRouteEvidence, firstProcess.evidence]),
        afterEvidence: firstText([
          groundedRelationEvidence(secondRoundResult, 'R2'),
          groundedKeyPointEvidence(secondRoundResult, ['K2', 'K3', 'K1', 'K4', 'K5'])
        ])
      };
  }
}

function resolveMissingCausalStep(secondRoundResult) {
  const k2 = getKeyPoint(secondRoundResult, 'K2');
  const k3 = getKeyPoint(secondRoundResult, 'K3');
  const r2 = getRelation(secondRoundResult, 'R2');

  if (!hasGroundedPoint(k2) || !hasGroundedPoint(k3)) {
    return { resolved: false, improvementType: null, reasonCode: 'CORE_CONTENT_STILL_MISSING' };
  }
  if (!r2 || r2.status !== 'CORRECT') {
    return { resolved: false, improvementType: null, reasonCode: 'CORE_RELATION_NOT_ESTABLISHED' };
  }
  if (!hasGroundedRelation(r2)) {
    return { resolved: false, improvementType: null, reasonCode: 'EVIDENCE_NOT_GROUNDED' };
  }
  if (hasGroundedIncorrectClaim(secondRoundResult)) {
    return { resolved: false, improvementType: null, reasonCode: 'CORE_RELATION_STILL_INCORRECT' };
  }
  return { resolved: true, improvementType: 'CAUSAL_LINK_ADDED', reasonCode: 'CORE_CHAIN_COMPLETED' };
}

function resolveIncorrectRelation(secondRoundResult) {
  const r2 = getRelation(secondRoundResult, 'R2');
  if (r2 && r2.status === 'INCORRECT') {
    return { resolved: false, improvementType: null, reasonCode: 'RELATION_STILL_INCORRECT' };
  }
  if (!r2 || r2.status !== 'CORRECT' || !hasGroundedRelation(r2)) {
    return { resolved: false, improvementType: null, reasonCode: 'EVIDENCE_NOT_GROUNDED' };
  }
  if (hasGroundedIncorrectClaim(secondRoundResult)) {
    return { resolved: false, improvementType: null, reasonCode: 'RELATION_STILL_INCORRECT' };
  }
  return { resolved: true, improvementType: 'RELATION_CORRECTED', reasonCode: 'RELATION_CORRECTED' };
}

function resolveLexicalRetrieval(secondRoundResult) {
  const task = (secondRoundResult && secondRoundResult.taskResult) || {};
  const process = (secondRoundResult && secondRoundResult.processResult) || {};
  const markers = Array.isArray(process.lexicalMarkers) ? process.lexicalMarkers : [];

  if (process.processIssue === PROCESS_ISSUE.LEXICAL_RETRIEVAL || markers.length > 0) {
    return { resolved: false, improvementType: null, reasonCode: 'LEXICAL_BLOCK_STILL_PRESENT' };
  }

  const blockedTaskStatuses = new Set([
    TASK_STATUS.MISSING_CORE_CONTENT,
    TASK_STATUS.INCORRECT_RELATION,
    TASK_STATUS.UNCERTAIN
  ]);
  if (task.coreFactsComplete !== true || blockedTaskStatuses.has(task.taskStatus)) {
    return { resolved: false, improvementType: null, reasonCode: 'CONTENT_REMOVED_WITH_LEXICAL_BLOCK' };
  }

  return { resolved: true, improvementType: 'LEXICAL_BLOCK_RESOLVED', reasonCode: 'LEXICAL_BLOCK_REMOVED' };
}

function resolveInformationOrder(secondRoundResult) {
  const task = (secondRoundResult && secondRoundResult.taskResult) || {};
  const process = (secondRoundResult && secondRoundResult.processResult) || {};
  const orderAnalysis = process.orderAnalysis || {};

  if (task.taskStatus === TASK_STATUS.INCORRECT_RELATION) {
    return { resolved: false, improvementType: null, reasonCode: 'NEW_CORE_ERROR_AFTER_REORDER' };
  }
  if (process.processIssue === PROCESS_ISSUE.INFORMATION_ORDER || orderAnalysis.eligible !== false) {
    return { resolved: false, improvementType: null, reasonCode: 'ORDER_ISSUE_STILL_PRESENT' };
  }
  if (task.taskStatus === TASK_STATUS.MISSING_CORE_CONTENT || task.taskStatus === TASK_STATUS.UNCERTAIN) {
    return { resolved: false, improvementType: null, reasonCode: 'CONTENT_DEGRADED_AFTER_REORDER' };
  }

  return { resolved: true, improvementType: 'ORDER_CLARIFIED', reasonCode: 'ORDER_ISSUE_REMOVED' };
}

function resolveUncertain(secondRoundResult) {
  const task = (secondRoundResult && secondRoundResult.taskResult) || {};
  if (task.taskStatus === TASK_STATUS.UNCERTAIN || !hasAnyGroundedRelevantPoint(secondRoundResult)) {
    return { resolved: false, improvementType: null, reasonCode: 'SECOND_ROUND_STILL_UNCERTAIN' };
  }
  if (task.taskStatus === TASK_STATUS.PASS && task.coreMeaningClear === true) {
    return { resolved: true, improvementType: 'EVIDENCE_CLARIFIED', reasonCode: 'UNCERTAIN_CLARIFIED_PASS' };
  }
  return {
    resolved: false,
    improvementType: 'EVIDENCE_CLARIFIED',
    reasonCode: 'UNCERTAIN_CLARIFIED_ISSUE_REMAINS'
  };
}

function resolveExpressionTarget(
  originalTrainingNeed,
  originalExpressionTarget,
  firstRoundResult,
  secondRoundResult
) {
  const task = (secondRoundResult && secondRoundResult.taskResult) || {};
  const firstExpression = originalExpressionTarget || expressionOf(firstRoundResult);
  const secondExpression = expressionOf(secondRoundResult);
  const firstTargetIds = Array.isArray(firstExpression.relatedKeyPointIds)
    ? firstExpression.relatedKeyPointIds
    : [];
  const secondConcept = conceptOf(secondRoundResult);
  if ((secondConcept.detected && sameTargetIds(firstTargetIds, secondConcept.relatedKeyPointIds))
    || hasGroundedIncorrectClaim(secondRoundResult)) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_CONCEPT_INACCURATE' };
  }
  if (task.taskStatus === TASK_STATUS.CONCEPT_INACCURACY) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_CONCEPT_INACCURATE' };
  }
  if (task.taskStatus === TASK_STATUS.INCORRECT_RELATION) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_MEANING_CHANGED' };
  }
  const targetRetryEvaluation = groundedTargetRetryEvaluation(secondRoundResult);
  if (targetRetryEvaluation && targetRetryEvaluation.meaningChanged === true) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_MEANING_CHANGED' };
  }
  if (targetRetryEvaluation && targetRetryEvaluation.targetRetained === false) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_CONTENT_REMOVED' };
  }
  const targetRetentionConfirmed = targetRetryEvaluation
    ? targetRetryEvaluation.targetRetained === true
    : relatedContentPreserved(secondRoundResult, firstTargetIds);
  if (!targetRetentionConfirmed) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_RETENTION_UNCERTAIN' };
  }
  if (secondExpression.issue === originalTrainingNeed
    && sameTargetIds(firstTargetIds, secondExpression.relatedKeyPointIds)) {
    return {
      resolved: false,
      improvementType: null,
      reasonCode: originalTrainingNeed === TRAINING_NEEDS.WORDING_PRECISION
        ? 'WORDING_PRECISION_STILL_PRESENT'
        : 'FORMULATION_BREAKDOWN_STILL_PRESENT'
    };
  }
  return {
    resolved: true,
    improvementType: originalTrainingNeed === TRAINING_NEEDS.WORDING_PRECISION
      ? 'WORDING_REFINED'
      : 'FORMULATION_COMPLETED',
    reasonCode: originalTrainingNeed === TRAINING_NEEDS.WORDING_PRECISION
      ? 'WORDING_REFINED'
      : 'FORMULATION_COMPLETED'
  };
}

function resolveConceptTarget(firstRoundResult, secondRoundResult) {
  const task = (secondRoundResult && secondRoundResult.taskResult) || {};
  const firstConcept = conceptOf(firstRoundResult);
  const secondConcept = conceptOf(secondRoundResult);
  const firstHasGroundedBinding = Boolean(
    hasStoredGroundedSpan(firstConcept.userEvidence)
    && hasStoredGroundedSpan(firstConcept.materialEvidence)
  );
  const secondHasGroundedConcept = Boolean(
    secondConcept.detected
    && hasStoredGroundedSpan(secondConcept.userEvidence)
    && hasStoredGroundedSpan(secondConcept.materialEvidence)
  );
  const targetsSameConcept = firstConcept.relatedKeyPointIds.length
    ? sameTargetIds(firstConcept.relatedKeyPointIds, secondConcept.relatedKeyPointIds)
    : firstHasGroundedBinding;
  if (secondHasGroundedConcept && targetsSameConcept) {
    return { resolved: false, improvementType: null, reasonCode: 'CONCEPT_INACCURACY_STILL_PRESENT' };
  }
  if (!relatedContentPreserved(secondRoundResult, firstConcept.relatedKeyPointIds)) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_CONTENT_REMOVED' };
  }
  if ([TASK_STATUS.INCORRECT_RELATION, TASK_STATUS.CONCEPT_INACCURACY].includes(task.taskStatus)
    || hasGroundedIncorrectClaim(secondRoundResult)) {
    return { resolved: false, improvementType: null, reasonCode: 'CONCEPT_INACCURACY_STILL_PRESENT' };
  }
  const correctionEvidence = groundedConceptCorrectionEvidence(
    firstRoundResult,
    secondRoundResult,
    firstConcept
  );
  if ([TASK_STATUS.MISSING_CORE_CONTENT, TASK_STATUS.RELATION_NOT_ESTABLISHED]
    .includes(task.taskStatus)) {
    return correctionEvidence
      ? {
        resolved: false,
        improvementType: null,
        reasonCode: 'CONCEPT_CORRECTED_CONTENT_INCOMPLETE'
      }
      : { resolved: false, improvementType: null, reasonCode: 'TARGET_RETENTION_UNCERTAIN' };
  }
  if (task.taskStatus === TASK_STATUS.UNCERTAIN || !correctionEvidence) {
    return { resolved: false, improvementType: null, reasonCode: 'TARGET_RETENTION_UNCERTAIN' };
  }
  return { resolved: true, improvementType: 'CONCEPT_CORRECTED', reasonCode: 'CONCEPT_CORRECTED' };
}

function resolveRetellingProgress({
  originalTrainingNeed,
  originalRetryScope,
  originalConceptTarget,
  originalExpressionTarget,
  firstRoundResult,
  secondRoundResult
} = {}) {
  if (!Object.values(TRAINING_NEEDS).includes(originalTrainingNeed)) {
    throw new Error(`Unsupported originalTrainingNeed: ${originalTrainingNeed || '(empty)'}`);
  }
  if (!firstRoundResult || !secondRoundResult) {
    throw new Error('firstRoundResult and secondRoundResult are required');
  }
  const expectedRetryScope = retryScopeForNeed(originalTrainingNeed);
  const retryScope = originalRetryScope || expectedRetryScope;
  if (retryScope !== expectedRetryScope) {
    throw new Error(`Retry scope does not match originalTrainingNeed: ${retryScope}`);
  }

  let resolution;
  switch (originalTrainingNeed) {
    case TRAINING_NEEDS.MISSING_CAUSAL_STEP:
      resolution = resolveMissingCausalStep(secondRoundResult);
      break;
    case TRAINING_NEEDS.INCORRECT_RELATION:
      resolution = resolveIncorrectRelation(secondRoundResult);
      break;
    case TRAINING_NEEDS.LEXICAL_RETRIEVAL:
      resolution = resolveLexicalRetrieval(secondRoundResult);
      break;
    case TRAINING_NEEDS.INFORMATION_ORDER:
      resolution = resolveInformationOrder(secondRoundResult);
      break;
    case TRAINING_NEEDS.UNCERTAIN:
      resolution = resolveUncertain(secondRoundResult);
      break;
    case TRAINING_NEEDS.WORDING_PRECISION:
    case TRAINING_NEEDS.FORMULATION_BREAKDOWN:
      resolution = resolveExpressionTarget(
        originalTrainingNeed,
        originalExpressionTarget,
        firstRoundResult,
        secondRoundResult
      );
      break;
    case TRAINING_NEEDS.CONCEPT_INACCURACY:
      resolution = resolveConceptTarget(
        originalConceptTarget
          ? Object.assign({}, firstRoundResult, {
            routedResult: Object.assign({}, firstRoundResult.routedResult, {
              conceptTarget: originalConceptTarget
            })
          })
          : firstRoundResult,
        secondRoundResult
      );
      break;
    default:
      throw new Error(`Unsupported originalTrainingNeed: ${originalTrainingNeed}`);
  }

  const evidence = selectProgressEvidence({
    originalTrainingNeed,
    originalExpressionTarget,
    firstRoundResult,
    secondRoundResult
  });
  return {
    originalTrainingNeed,
    originalRetryScope: retryScope,
    resolved: resolution.resolved,
    improvementType: resolution.improvementType,
    beforeEvidence: evidence.beforeEvidence,
    afterEvidence: evidence.afterEvidence,
    reasonCode: resolution.reasonCode,
    coreMeaningClearAfter: hasCoreChain(secondRoundResult)
  };
}

module.exports = {
  TRAINING_NEEDS,
  TASK_STATUS,
  PROCESS_ISSUE,
  RETRY_SCOPES,
  retryScopeForNeed,
  resolveRetellingProgress,
  selectProgressEvidence,
  hasCoreChain,
  expressionOf,
  conceptOf,
  groundedTargetRetryEvaluation,
  resolveExpressionTarget,
  resolveConceptTarget
};
