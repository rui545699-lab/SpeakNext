'use strict';

const SUPPORTED_NEEDS = new Set(['CONCEPT_INACCURACY', 'WORDING_PRECISION']);

const UNCERTAIN_VARIANTS = Object.freeze({
  RELATION_UNCLEAR: 'RELATION_UNCLEAR',
  GENERAL: 'GENERAL'
});

const UNCERTAIN_PRESENTATION = Object.freeze({
  [UNCERTAIN_VARIANTS.RELATION_UNCLEAR]: Object.freeze({
    uncertainVariant: UNCERTAIN_VARIANTS.RELATION_UNCLEAR,
    eyebrow: '只调整一个地方',
    title: '把原因和结果连起来',
    description: '关键内容已经有了。再说一遍，重点说明它们之间的关系。',
    buttonText: '重新说一次'
  }),
  [UNCERTAIN_VARIANTS.GENERAL]: Object.freeze({
    uncertainVariant: UNCERTAIN_VARIANTS.GENERAL,
    eyebrow: '再确认一次',
    title: '再完整说一遍',
    description: '刚才还没能判断完整意思。再说一次，把原因和最后的结果连起来。',
    buttonText: '重新说一次'
  })
});

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function evidencePointId(target) {
  const field = clean(target && target.materialEvidence && target.materialEvidence.field);
  const match = /key_points\.(K\d+)/.exec(field);
  return match ? match[1] : '';
}

function materialEvidenceReference(target) {
  const evidence = target && target.materialEvidence;
  const value = clean(evidence && evidence.text);
  const field = clean(evidence && evidence.field);
  if (!value || !/^(core_message|key_points\.K\d+(?:\.text)?)$/.test(field)) return null;
  return {
    text: value,
    keyPointId: evidencePointId(target) || null,
    source: 'TARGET_MATERIAL_EVIDENCE'
  };
}

function buildGroundedReference({ material, target, trainingNeed } = {}) {
  if (!SUPPORTED_NEEDS.has(trainingNeed) || !material || !target) return null;
  const points = Array.isArray(material.keyPoints) ? material.keyPoints : [];
  const validIds = new Set(points.map((point) => point && point.id).filter(Boolean));
  const relatedIds = (Array.isArray(target.relatedKeyPointIds) ? target.relatedKeyPointIds : [])
    .filter((id, index, list) => validIds.has(id) && list.indexOf(id) === index);
  if (!relatedIds.length) {
    const suppliedIds = Array.isArray(target.relatedKeyPointIds) ? target.relatedKeyPointIds : [];
    return trainingNeed === 'CONCEPT_INACCURACY' && suppliedIds.length === 0
      ? materialEvidenceReference(target)
      : null;
  }

  const relatedPoints = relatedIds
    .map((id) => points.find((point) => point && point.id === id))
    .filter(Boolean);
  const groundedId = evidencePointId(target);
  const groundedPoint = relatedPoints.find((point) => point.id === groundedId);
  const configuredPoint = (groundedPoint && clean(groundedPoint.feedbackText) ? groundedPoint : null)
    || relatedPoints.find((point) => clean(point.feedbackText))
    || groundedPoint
    || relatedPoints[0];
  const referenceText = clean(configuredPoint.feedbackText) || clean(configuredPoint.displayText);
  if (!referenceText) return null;
  return {
    text: referenceText,
    keyPointId: configuredPoint.id,
    source: configuredPoint.feedbackText ? 'KEY_POINT_FEEDBACK_TEXT' : 'KEY_POINT_DISPLAY_TEXT'
  };
}

function buildUnresolvedConceptFeedback({ material, secondRoundResult, originalTarget } = {}) {
  const task = secondRoundResult && secondRoundResult.taskResult;
  const routed = secondRoundResult && secondRoundResult.routedResult;
  const target = (routed && routed.conceptTarget)
    || (task && task.conceptInaccuracy)
    || null;
  const transcript = clean(secondRoundResult && secondRoundResult.transcript);
  const userText = clean(target && target.userEvidence && target.userEvidence.text);
  if (!target || target.detected !== true || !userText || !transcript.includes(userText)) return null;
  const reference = buildGroundedReference({
    material,
    target,
    trainingNeed: 'CONCEPT_INACCURACY'
  }) || buildGroundedReference({
    material,
    target: originalTarget,
    trainingNeed: 'CONCEPT_INACCURACY'
  });
  if (!reference) return null;
  return {
    userEvidenceText: userText,
    referenceText: reference.text,
    referenceSource: reference.source
  };
}

function buildMissingHintQuestion({ material, taskResult } = {}) {
  const hints = material && material.missingHintQuestions;
  if (!hints || typeof hints !== 'object') return null;
  const missingIds = Array.isArray(taskResult && taskResult.missingCorePointIds)
    ? taskResult.missingCorePointIds
    : [];
  const targetId = ['K2', 'K3'].find((id) => missingIds.includes(id) && clean(hints[id]))
    || (clean(hints.R2) ? 'R2' : '');
  if (!targetId) return null;
  return {
    text: clean(hints[targetId]),
    targetId,
    source: 'MATERIAL_MISSING_HINT_QUESTION'
  };
}

function buildResultReference({ material, trainingNeed, target } = {}) {
  if (!material) return null;
  if (SUPPORTED_NEEDS.has(trainingNeed)) {
    const targeted = buildGroundedReference({ material, target, trainingNeed });
    if (targeted) return targeted;
  }
  if (trainingNeed === 'FORMULATION_BREAKDOWN') {
    const cue = buildExpressionCue({ material, target });
    if (cue) return cue;
  }
  const referenceText = clean(material.resultReference);
  if (!referenceText) return null;
  return {
    text: referenceText,
    keyPointId: null,
    source: 'MATERIAL_RESULT_REFERENCE'
  };
}

function buildExpressionCue({ material, target } = {}) {
  if (!material || !target) return null;
  const points = Array.isArray(material.keyPoints) ? material.keyPoints : [];
  const relatedIds = Array.isArray(target.relatedKeyPointIds) ? target.relatedKeyPointIds : [];
  const point = relatedIds
    .map((id) => points.find((item) => item && item.id === id))
    .find(Boolean);
  if (!point) return null;
  const cue = clean(point.expressionCue)
    || (clean(point.displayText).length <= 20 ? clean(point.displayText) : '');
  if (!cue) return null;
  return { text: cue, keyPointId: point.id, source: point.expressionCue
    ? 'KEY_POINT_EXPRESSION_CUE'
    : 'KEY_POINT_DISPLAY_TEXT' };
}

function buildRetryPresentation({ trainingNeed, retryScope } = {}) {
  if (retryScope !== 'TARGET_EXPRESSION') return null;
  if (trainingNeed === 'FORMULATION_BREAKDOWN') {
    return {
      eyebrow: '只调整这一句',
      title: '把这句话重新说完整',
      description: '不用重新说整篇，把刚才卡住的这句话重新说清楚。',
      buttonText: '重新说这句话'
    };
  }
  if (trainingNeed === 'WORDING_PRECISION') {
    return {
      eyebrow: '只调整这一句',
      title: '这句话可以说得更准确',
      description: '不用重新说整篇，把这一句换个更准确的说法。',
      buttonText: '重新说这句话'
    };
  }
  return null;
}

function buildUncertainPresentation({ firstRoundResult } = {}) {
  const taskResult = firstRoundResult && firstRoundResult.taskResult;
  const routedResult = firstRoundResult && firstRoundResult.routedResult;
  if (!taskResult || !routedResult || routedResult.primaryTrainingNeed !== 'UNCERTAIN') {
    return null;
  }

  const relations = Array.isArray(taskResult.relations) ? taskResult.relations : [];
  const coreRelation = relations.find((relation) => relation && relation.id === 'R2');
  const incorrectClaims = Array.isArray(taskResult.incorrectClaims)
    ? taskResult.incorrectClaims
    : [];
  const conceptInaccuracy = taskResult.conceptInaccuracy || {};
  const relationUnclear = taskResult.taskStatus === 'UNCERTAIN'
    && taskResult.coreFactsComplete === true
    && coreRelation
    && coreRelation.status === 'UNSUPPORTED'
    && incorrectClaims.length === 0
    && conceptInaccuracy.detected !== true;
  const variant = relationUnclear
    ? UNCERTAIN_VARIANTS.RELATION_UNCLEAR
    : UNCERTAIN_VARIANTS.GENERAL;

  return Object.assign({}, UNCERTAIN_PRESENTATION[variant]);
}

module.exports = {
  UNCERTAIN_VARIANTS,
  buildGroundedReference,
  buildExpressionCue,
  buildMissingHintQuestion,
  buildUnresolvedConceptFeedback,
  buildResultReference,
  buildRetryPresentation,
  buildUncertainPresentation
};
