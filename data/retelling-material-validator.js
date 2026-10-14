'use strict';

const REQUIRED_POINT_IDS = Object.freeze(['K1', 'K2', 'K3', 'K4', 'K5']);
const REQUIRED_MISSING_HINT_IDS = Object.freeze(['K2', 'K3', 'R2']);

function nonEmpty(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function validateMaterial(material) {
  if (!material || typeof material !== 'object') throw new Error('INVALID_RETELLING_MATERIAL');
  if (!nonEmpty(material.id) || !nonEmpty(material.title)
    || !nonEmpty(material.text) || !nonEmpty(material.coreMessage)
    || !nonEmpty(material.resultReference)) {
    throw new Error(`INVALID_RETELLING_MATERIAL_FIELDS:${material.id || '(empty)'}`);
  }
  if (!Array.isArray(material.keyPoints) || !Array.isArray(material.relations)) {
    throw new Error(`INVALID_RETELLING_MATERIAL_STRUCTURE:${material.id}`);
  }
  const pointIds = new Set(material.keyPoints.map((item) => item && item.id));
  if (pointIds.size !== REQUIRED_POINT_IDS.length
    || REQUIRED_POINT_IDS.some((id) => !pointIds.has(id))) {
    throw new Error(`INVALID_RETELLING_KEY_POINTS:${material.id}`);
  }
  const k2 = material.keyPoints.find((item) => item.id === 'K2');
  const k3 = material.keyPoints.find((item) => item.id === 'K3');
  if (!k2 || k2.role !== 'CORE' || !k3 || k3.role !== 'CORE') {
    throw new Error(`INVALID_RETELLING_CORE_POINTS:${material.id}`);
  }
  if (material.keyPoints.some((item) => !nonEmpty(item.role) || !nonEmpty(item.text))) {
    throw new Error(`INVALID_RETELLING_KEY_POINT_FIELDS:${material.id}`);
  }
  if (material.keyPoints.some((item) => item.semanticAnchors !== undefined
    && (!Array.isArray(item.semanticAnchors)
      || item.semanticAnchors.some((anchor) => !nonEmpty(anchor))))) {
    throw new Error(`INVALID_RETELLING_SEMANTIC_ANCHORS:${material.id}`);
  }
  if (material.keyPoints.some((item) => item.feedbackText !== undefined
    && !nonEmpty(item.feedbackText))) {
    throw new Error(`INVALID_RETELLING_FEEDBACK_TEXT:${material.id}`);
  }
  if (material.keyPoints.some((item) => item.expressionCue !== undefined
    && !nonEmpty(item.expressionCue))) {
    throw new Error(`INVALID_RETELLING_EXPRESSION_CUE:${material.id}`);
  }
  if (!material.missingHintQuestions || typeof material.missingHintQuestions !== 'object'
    || REQUIRED_MISSING_HINT_IDS.some((id) => !nonEmpty(material.missingHintQuestions[id]))) {
    throw new Error(`INVALID_RETELLING_MISSING_HINTS:${material.id}`);
  }
  if (Object.keys(material.missingHintQuestions)
    .some((id) => !REQUIRED_MISSING_HINT_IDS.includes(id))) {
    throw new Error(`INVALID_RETELLING_MISSING_HINT_ID:${material.id}`);
  }
  const r1 = material.relations.find((item) => item && item.id === 'R1');
  const r2 = material.relations.find((item) => item && item.id === 'R2');
  if (!r1 || !r2 || r2.from !== 'K2' || r2.to !== 'K3') {
    throw new Error(`INVALID_RETELLING_RELATIONS:${material.id}`);
  }
  if (material.relations.some((item) => !pointIds.has(item.from) || !pointIds.has(item.to))) {
    throw new Error(`INVALID_RETELLING_RELATION_REFERENCE:${material.id}`);
  }
  return true;
}

function validateMaterialBank(materials) {
  if (!Array.isArray(materials) || !materials.length) throw new Error('EMPTY_RETELLING_MATERIAL_BANK');
  const ids = new Set();
  materials.forEach((item) => {
    validateMaterial(item);
    if (ids.has(item.id)) throw new Error(`DUPLICATE_RETELLING_MATERIAL_ID:${item.id}`);
    ids.add(item.id);
  });
  return true;
}

module.exports = {
  REQUIRED_POINT_IDS,
  REQUIRED_MISSING_HINT_IDS,
  validateMaterial,
  validateMaterialBank
};
