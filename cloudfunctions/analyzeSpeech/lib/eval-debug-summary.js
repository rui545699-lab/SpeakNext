'use strict';

const KEY_POINT_IDS = Object.freeze(['K1', 'K2', 'K3', 'K4', 'K5']);
const RELATION_IDS = Object.freeze(['R1', 'R2']);
const RELATION_STATUSES = new Set(['CORRECT', 'INCORRECT', 'MISSING', 'UNSUPPORTED']);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function keyPointCoverage(taskResult) {
  const points = list(taskResult && taskResult.keyPoints);
  return KEY_POINT_IDS.reduce((summary, id) => {
    const point = points.find((item) => item && item.id === id);
    summary[id] = Boolean(point && point.covered === true);
    return summary;
  }, {});
}

function relationStatuses(taskResult) {
  const relations = list(taskResult && taskResult.relations);
  return RELATION_IDS.reduce((summary, id) => {
    const relation = relations.find((item) => item && item.id === id);
    const status = relation && relation.status;
    summary[id] = RELATION_STATUSES.has(status) ? status : 'UNSUPPORTED';
    return summary;
  }, {});
}

function observedOrder(processResult) {
  const order = processResult && processResult.orderAnalysis
    && processResult.orderAnalysis.observedOrder;
  return list(order).filter((item) => typeof item === 'string');
}

function expressionFields(processResult) {
  const process = processResult || {};
  return {
    expressionIssue: process.expressionIssue || 'NONE',
    expressionReasonCode: process.reasonCode || '',
    expressionUserEvidence: process.userEvidence && process.userEvidence.text
      ? process.userEvidence.text
      : '',
    expressionMaterialEvidence: process.materialEvidence && process.materialEvidence.text
      ? process.materialEvidence.text
      : '',
    expressionRelatedKeyPointIds: list(process.relatedKeyPointIds).slice()
  };
}

function conceptFields(taskResult) {
  const concept = (taskResult && taskResult.conceptInaccuracy) || {};
  return {
    conceptInaccuracyDetected: concept.detected === true,
    conceptReasonCode: concept.reasonCode || '',
    conceptUserEvidence: concept.userEvidence && concept.userEvidence.text
      ? concept.userEvidence.text
      : '',
    conceptMaterialEvidence: concept.materialEvidence && concept.materialEvidence.text
      ? concept.materialEvidence.text
      : '',
    conceptRelatedKeyPointIds: list(concept.relatedKeyPointIds).slice(),
    conceptConfidence: concept.confidence || 'LOW'
  };
}

function targetRetryFields(processResult) {
  const target = processResult && processResult.targetRetryEvaluation;
  return {
    targetRetryApplicable: Boolean(target && target.applicable === true),
    targetRetained: target && [true, false, 'UNCERTAIN'].includes(target.targetRetained)
      ? target.targetRetained
      : null,
    targetEvidence: target && target.targetEvidence && target.targetEvidence.text
      ? target.targetEvidence.text
      : '',
    targetMeaningChanged: Boolean(target && target.meaningChanged === true),
    targetRetryReasonCode: target && target.reasonCode ? target.reasonCode : ''
  };
}

function buildFirstRoundDebugSummary({ material, transcript, evaluation } = {}) {
  const task = (evaluation && evaluation.taskResult) || {};
  const process = (evaluation && evaluation.processResult) || {};
  const routed = (evaluation && evaluation.routedResult) || {};
  const routedConcept = routed.conceptTarget || {};
  return Object.assign({
    stage: 'FIRST_ROUND',
    materialId: material && typeof material.id === 'string' ? material.id : '',
    requestId: evaluation && typeof evaluation.requestId === 'string' ? evaluation.requestId : '',
    transcript: typeof transcript === 'string' ? transcript : '',
    taskStatus: task.taskStatus || '',
    coreMeaningClear: task.coreMeaningClear === true,
    missingCorePointIds: list(task.missingCorePointIds).slice(),
    keyPoints: keyPointCoverage(task),
    relations: relationStatuses(task),
    processIssue: process.processIssue || 'NONE',
    observedOrder: observedOrder(process),
    primaryTrainingNeed: routed.primaryTrainingNeed || '',
    recommendedAction: routed.recommendedAction || '',
    routedConceptUserEvidence: routedConcept.userEvidence && routedConcept.userEvidence.text
      ? routedConcept.userEvidence.text
      : '',
    routedConceptMaterialEvidence: routedConcept.materialEvidence && routedConcept.materialEvidence.text
      ? routedConcept.materialEvidence.text
      : '',
    routedConceptRelatedKeyPointIds: list(routedConcept.relatedKeyPointIds).slice()
  }, conceptFields(task), expressionFields(process));
}

function buildSecondRoundDebugSummary({ material, transcript, evaluation, progressResult } = {}) {
  const task = (evaluation && evaluation.taskResult) || {};
  const process = (evaluation && evaluation.processResult) || {};
  const routed = (evaluation && evaluation.routedResult) || {};
  const progress = progressResult || {};
  return Object.assign({
    stage: 'SECOND_ROUND',
    materialId: material && typeof material.id === 'string' ? material.id : '',
    requestId: evaluation && typeof evaluation.requestId === 'string' ? evaluation.requestId : '',
    transcript: typeof transcript === 'string' ? transcript : '',
    secondTaskStatus: task.taskStatus || '',
    keyPoints: keyPointCoverage(task),
    relations: relationStatuses(task),
    secondProcessIssue: process.processIssue || 'NONE',
    secondPrimaryTrainingNeed: routed.primaryTrainingNeed || '',
    originalTrainingNeed: progress.originalTrainingNeed || '',
    resolved: progress.resolved === true,
    improvementType: progress.improvementType || null,
    reasonCode: progress.reasonCode || '',
    coreMeaningClearAfter: progress.coreMeaningClearAfter === true
  }, conceptFields(task), expressionFields(process), targetRetryFields(process));
}

module.exports = {
  buildFirstRoundDebugSummary,
  buildSecondRoundDebugSummary
};
