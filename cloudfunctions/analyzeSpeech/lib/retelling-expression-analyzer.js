'use strict';

const { groundedSpan } = require('./retelling-grounded-facts');
const { findContextualLexicalMarkers } = require('./signal-analyzer');

const EXPRESSION_ISSUES = Object.freeze(['NONE', 'WORDING_PRECISION', 'FORMULATION_BREAKDOWN']);
const CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
const BREAKDOWN_PATTERN = /(?:所以|导致|因为|但是|然后|如果|使得)[。！？.!?](?:\s|呃|嗯|啊|，|,)*[^。！？.!?]{1,40}/;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function materialEvidenceSpan(material, evidence) {
  const candidate = clean(evidence);
  if (!candidate || !material) return null;
  const sources = [
    { field: 'core_message', text: material.core_message || material.coreMessage },
    ...(Array.isArray(material.key_points) ? material.key_points : material.keyPoints || [])
      .flatMap((point) => [
        { field: `key_points.${point.id}`, text: point.text },
        { field: `key_points.${point.id}`, text: point.display_text || point.displayText }
      ])
  ];
  for (const source of sources) {
    const text = clean(source.text);
    const start = text.indexOf(candidate);
    if (start >= 0) return { text: candidate, start, end: start + candidate.length, field: source.field };
  }
  return null;
}

function validRelatedIds(material, value) {
  const points = Array.isArray(material && material.key_points)
    ? material.key_points
    : (material && material.keyPoints) || [];
  const valid = new Set(points.map((point) => point.id));
  return (Array.isArray(value) ? value : [])
    .filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
}

function coveredCoreIds(taskResult, material) {
  const points = Array.isArray(taskResult && taskResult.keyPoints) ? taskResult.keyPoints : [];
  const definitions = Array.isArray(material && material.key_points) ? material.key_points : [];
  const core = new Set(definitions.filter((point) => point.role === 'CORE').map((point) => point.id));
  return points.filter((point) => point.covered === true && core.has(point.id)).map((point) => point.id);
}

function none(reasonCode = 'EXPRESSION_NONE') {
  return {
    expressionIssue: 'NONE',
    reasonCode,
    userEvidence: null,
    materialEvidence: null,
    relatedKeyPointIds: [],
    confidence: 'LOW'
  };
}

function spanFromTranscript(transcript, evidence) {
  return groundedSpan(transcript, evidence);
}

function retryContextValues(retryContext) {
  const legacyTarget = retryContext && retryContext.originalExpressionTarget;
  return {
    trainingNeed: retryContext && (retryContext.trainingNeed || retryContext.originalTrainingNeed),
    retryScope: retryContext && (retryContext.retryScope || retryContext.originalRetryScope),
    relatedKeyPointIds: retryContext && Array.isArray(retryContext.relatedKeyPointIds)
      ? retryContext.relatedKeyPointIds
      : (legacyTarget && Array.isArray(legacyTarget.relatedKeyPointIds)
        ? legacyTarget.relatedKeyPointIds
        : [])
  };
}

function normalizeTargetRetryEvaluation({ transcript, retryContext, rawEvaluation } = {}) {
  const context = retryContextValues(retryContext);
  if (context.retryScope !== 'TARGET_EXPRESSION') return null;
  const candidate = rawEvaluation && rawEvaluation.target_retry_evaluation;
  if (!candidate || candidate.applicable !== true) return null;
  let targetRetained = candidate.target_retained;
  if (typeof targetRetained === 'string' && targetRetained.toLowerCase() === 'uncertain') {
    targetRetained = 'UNCERTAIN';
  }
  if (![true, false, 'UNCERTAIN'].includes(targetRetained)) return null;
  const meaningChanged = candidate.meaning_changed === true;
  const targetEvidence = spanFromTranscript(clean(transcript), candidate.target_evidence);
  if ((targetRetained !== 'UNCERTAIN' || meaningChanged) && !targetEvidence) return null;
  return {
    applicable: true,
    targetRetained,
    targetEvidence,
    meaningChanged,
    reasonCode: clean(candidate.reason_code) || 'TARGET_RETENTION_EVALUATED',
    relatedKeyPointIds: context.relatedKeyPointIds
  };
}

function hasStrongBreakdownEvidence(evidence) {
  return BREAKDOWN_PATTERN.test(clean(evidence));
}

function breakdownSpan(transcript) {
  const source = clean(transcript);
  const match = BREAKDOWN_PATTERN.exec(source);
  if (!match) return null;
  return { text: match[0], start: match.index, end: match.index + match[0].length };
}

function lexicalInterruption(transcript, taskResult, material, candidate) {
  const markers = findContextualLexicalMarkers(transcript);
  if (!markers.length) return null;
  const marker = markers[0];
  const span = groundedSpan(transcript, marker);
  if (!span) return null;
  const candidateIds = validRelatedIds(material, candidate && candidate.related_key_point_ids);
  const materialEvidence = materialEvidenceSpan(material, candidate && candidate.material_evidence);
  return {
    expressionIssue: 'FORMULATION_BREAKDOWN',
    reasonCode: 'WORD_SEARCH_INTERRUPTION',
    userEvidence: span,
    materialEvidence,
    relatedKeyPointIds: candidateIds.length
      ? candidateIds
      : coveredCoreIds(taskResult, material),
    confidence: 'HIGH'
  };
}

function analyzeRetellingExpression({
  transcript,
  material,
  taskResult,
  rawEvaluation,
  retryContext
} = {}) {
  const source = clean(transcript);
  const candidate = rawEvaluation && rawEvaluation.expression_diagnosis;
  if (taskResult && taskResult.conceptInaccuracy
    && (taskResult.conceptInaccuracy.detected
      || taskResult.conceptInaccuracy.reasonCode === 'CONCEPT_EVIDENCE_NOT_GROUNDED')) {
    return none(taskResult.conceptInaccuracy.detected
      ? 'CONTENT_CONCEPT_PRIORITY'
      : 'UNGROUNDED_CONCEPT_NOT_DOWNGRADED');
  }
  const lexical = lexicalInterruption(source, taskResult, material, candidate);
  if (lexical) return lexical;
  if (!candidate || !EXPRESSION_ISSUES.includes(candidate.issue) || candidate.issue === 'NONE') return none();

  const userEvidence = spanFromTranscript(source, candidate.user_evidence);
  const relatedKeyPointIds = validRelatedIds(material, candidate.related_key_point_ids);
  const confidence = CONFIDENCE_LEVELS.includes(candidate.confidence) ? candidate.confidence : 'LOW';
  if (!userEvidence || !relatedKeyPointIds.length) return none('EXPRESSION_EVIDENCE_NOT_GROUNDED');

  if (candidate.issue === 'WORDING_PRECISION') {
    const context = retryContextValues(retryContext);
    const originalTargetIds = context.relatedKeyPointIds;
    const targetedWordingReview = retryContext
      && context.retryScope === 'TARGET_EXPRESSION'
      && context.trainingNeed === 'WORDING_PRECISION'
      && relatedKeyPointIds.some((id) => originalTargetIds.includes(id));
    if (!taskResult || (taskResult.taskStatus !== 'PASS' && !targetedWordingReview)) {
      return none('WORDING_REQUIRES_CONTENT_PASS');
    }
    const materialEvidence = materialEvidenceSpan(material, candidate.material_evidence);
    if (!materialEvidence || confidence !== 'HIGH') {
      const fallbackEvidence = breakdownSpan(source);
      if (fallbackEvidence) {
        return {
          expressionIssue: 'FORMULATION_BREAKDOWN',
          reasonCode: 'CLAUSE_FORMATION_INTERRUPTED',
          userEvidence: fallbackEvidence,
          materialEvidence: null,
          relatedKeyPointIds,
          confidence: 'MEDIUM'
        };
      }
      return none('WORDING_PRECISION_NOT_STRONG_ENOUGH');
    }
    return {
      expressionIssue: 'WORDING_PRECISION',
      reasonCode: clean(candidate.reason_code) || 'MEANING_SHIFT_IN_WORDING',
      userEvidence,
      materialEvidence,
      relatedKeyPointIds,
      confidence
    };
  }

  const reasonCode = clean(candidate.reason_code) || 'CLAUSE_FORMATION_INTERRUPTED';
  if (!['HIGH', 'MEDIUM'].includes(confidence)
    || (reasonCode !== 'WORD_SEARCH_INTERRUPTION' && !hasStrongBreakdownEvidence(userEvidence.text))) {
    return none('FORMULATION_BREAKDOWN_NOT_STRONG_ENOUGH');
  }
  return {
    expressionIssue: 'FORMULATION_BREAKDOWN',
    reasonCode,
    userEvidence,
    materialEvidence: materialEvidenceSpan(material, candidate.material_evidence),
    relatedKeyPointIds,
    confidence
  };
}

module.exports = {
  EXPRESSION_ISSUES,
  CONFIDENCE_LEVELS,
  materialEvidenceSpan,
  hasStrongBreakdownEvidence,
  breakdownSpan,
  normalizeTargetRetryEvaluation,
  analyzeRetellingExpression
};
