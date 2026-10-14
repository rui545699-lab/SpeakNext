'use strict';

const { groundedSpan } = require('./retelling-grounded-facts');

const CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function materialPoints(material) {
  return Array.isArray(material && material.key_points)
    ? material.key_points
    : (material && material.keyPoints) || [];
}

function materialEvidenceSpan(material, evidence) {
  const candidate = clean(evidence);
  if (!candidate || !material) return null;
  const sources = [
    { field: 'core_message', text: material.core_message || material.coreMessage }
  ];
  materialPoints(material).forEach((point) => {
    sources.push({ field: `key_points.${point.id}.text`, text: point.text });
    sources.push({
      field: `key_points.${point.id}.display_text`,
      text: point.display_text || point.displayText
    });
  });
  for (const source of sources) {
    const text = clean(source.text);
    const start = text.indexOf(candidate);
    if (start >= 0) {
      return { text: candidate, start, end: start + candidate.length, field: source.field };
    }
  }
  return null;
}

function validRelatedIds(material, value) {
  const valid = new Set(materialPoints(material).map((point) => point.id));
  return (Array.isArray(value) ? value : [])
    .filter((id, index, items) => valid.has(id) && items.indexOf(id) === index);
}

function none(reasonCode = 'CONCEPT_NONE', confidence = 'LOW') {
  return {
    detected: false,
    userEvidence: null,
    materialEvidence: null,
    relatedKeyPointIds: [],
    reasonCode,
    confidence
  };
}

function normalizeConceptInaccuracy({ transcript, material, rawEvaluation } = {}) {
  const candidate = rawEvaluation && rawEvaluation.concept_inaccuracy;
  if (!candidate || candidate.detected !== true) return none();
  const confidence = CONFIDENCE_LEVELS.includes(candidate.confidence)
    ? candidate.confidence
    : 'LOW';
  const userEvidence = groundedSpan(clean(transcript), candidate.user_evidence);
  const materialEvidence = materialEvidenceSpan(material, candidate.material_evidence);
  const relatedKeyPointIds = validRelatedIds(material, candidate.related_key_point_ids);
  if (confidence !== 'HIGH' || !userEvidence || !materialEvidence || !relatedKeyPointIds.length) {
    return none('CONCEPT_EVIDENCE_NOT_GROUNDED', confidence);
  }
  return {
    detected: true,
    userEvidence,
    materialEvidence,
    relatedKeyPointIds,
    reasonCode: clean(candidate.reason_code) || 'CORE_MEANING_SHIFT',
    confidence
  };
}

module.exports = {
  CONFIDENCE_LEVELS,
  materialEvidenceSpan,
  validRelatedIds,
  normalizeConceptInaccuracy
};
