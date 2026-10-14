const RELATION_STATUSES = Object.freeze(['CORRECT', 'INCORRECT', 'MISSING', 'UNSUPPORTED']);
const COMPREHENSION_FAILURE_PATTERN = /没太?看懂|不太?理解|不知道这段(?:是)?什么意思|没明白这段(?:是)?什么意思/;
const ORDER_JUMP_PATTERN = /先|然后|再说|后来|最后|反正|不对|等一下/g;

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function groundedSpan(transcript, evidence) {
  const source = String(transcript || '');
  const candidate = cleanText(evidence);
  const start = candidate ? source.indexOf(candidate) : -1;
  return start < 0 ? null : { text: candidate, start, end: start + candidate.length };
}

function corePointIds(material) {
  return material.key_points.filter((item) => item.role === 'CORE').map((item) => item.id);
}

function coreRelationDefinition(material) {
  const coreIds = corePointIds(material);
  return material.relations.find((item) => coreIds.includes(item.from) && coreIds.includes(item.to)) || null;
}

function normalizeKeyPoints(value, material, transcript) {
  const candidates = Array.isArray(value) ? value : [];
  return material.key_points.map((definition) => {
    const candidate = candidates.find((item) => item && item.id === definition.id) || {};
    const span = candidate.covered === true ? groundedSpan(transcript, candidate.evidence) : null;
    return {
      id: definition.id,
      covered: Boolean(span),
      evidence: span ? span.text : '',
      start: span ? span.start : -1,
      end: span ? span.end : -1
    };
  });
}

function normalizeRelationCandidates(value, material, transcript) {
  const candidates = Array.isArray(value) ? value : [];
  return material.relations.map((definition) => {
    const candidate = candidates.find((item) => item && item.id === definition.id) || {};
    const from = groundedSpan(transcript, candidate.from_evidence);
    const to = groundedSpan(transcript, candidate.to_evidence);
    const relation = groundedSpan(transcript, candidate.relation_evidence);
    const rawStatus = RELATION_STATUSES.includes(candidate.status) ? candidate.status : 'UNSUPPORTED';
    const status = ['CORRECT', 'INCORRECT'].includes(rawStatus) && !(from && to && relation)
      ? 'UNSUPPORTED'
      : rawStatus;
    return {
      id: definition.id,
      status,
      fromEvidence: from ? from.text : '',
      toEvidence: to ? to.text : '',
      relationEvidence: relation ? relation.text : '',
      fromSpan: from,
      toSpan: to,
      relationSpan: relation
    };
  });
}

function normalizeIncorrectClaims(value, transcript) {
  return (Array.isArray(value) ? value : []).map((item) => {
    const span = item ? groundedSpan(transcript, item.evidence) : null;
    return span ? {
      claim: cleanText(item.claim) || span.text,
      evidence: span.text,
      start: span.start,
      end: span.end
    } : null;
  }).filter(Boolean).slice(0, 5);
}

function enforceCoreRelationConsistency(relations, rawValue, material) {
  const coreDefinition = coreRelationDefinition(material);
  if (!coreDefinition) return relations;
  const coreRelation = relations.find((item) => item.id === coreDefinition.id);
  if (!coreRelation || coreRelation.status === 'INCORRECT') return relations;
  const hasGroundedIncorrectClaim = Array.isArray(rawValue && rawValue.incorrect_claims)
    && rawValue.incorrect_claims.some((item) => item && cleanText(item.evidence));
  const misplaced = relations.find((item) => item.id !== coreDefinition.id
    && item.status === 'INCORRECT'
    && item.fromSpan && item.toSpan && item.relationSpan);
  const rawCallsCoreIncorrect = rawValue && rawValue.primary_training_need === 'INCORRECT_RELATION';
  if (!misplaced || (!hasGroundedIncorrectClaim && !rawCallsCoreIncorrect)) return relations;
  return relations.map((item) => {
    if (item.id === coreDefinition.id) {
      return Object.assign({}, item, {
        status: 'INCORRECT',
        fromEvidence: misplaced.toEvidence,
        toEvidence: misplaced.fromEvidence,
        relationEvidence: misplaced.relationEvidence,
        fromSpan: misplaced.toSpan,
        toSpan: misplaced.fromSpan,
        relationSpan: misplaced.relationSpan,
        consistencyRecoveredFrom: misplaced.id
      });
    }
    if (item.id === misplaced.id) {
      return Object.assign({}, item, {
        status: 'MISSING',
        fromEvidence: '',
        toEvidence: '',
        relationEvidence: '',
        fromSpan: null,
        toSpan: null,
        relationSpan: null
      });
    }
    return item;
  });
}

function hasClearRelationSemanticSupport(relation, transcript) {
  if (!relation || relation.status !== 'CORRECT'
    || !relation.fromSpan || !relation.toSpan || !relation.relationSpan) return false;
  const reversedEndpoints = relation.toSpan.start < relation.fromSpan.start;
  const orderJumps = (String(transcript || '').match(ORDER_JUMP_PATTERN) || []).length;
  const explicitEffectBeforeCause = /是因为|原因是|之所以/.test(relation.relationEvidence);
  return !(reversedEndpoints && orderJumps >= 2 && !explicitEffectBeforeCause);
}

function hasComprehensionFailure(transcript) {
  return COMPREHENSION_FAILURE_PATTERN.test(String(transcript || ''));
}

function buildGroundedFacts(value, input) {
  const transcript = cleanText(input && input.transcript, 4000);
  const material = input && input.material;
  if (!transcript || !material || !Array.isArray(material.key_points) || !Array.isArray(material.relations)) {
    throw new Error('RETELLING_CONTENT_INPUT_INVALID');
  }
  const keyPoints = normalizeKeyPoints(value && value.key_points, material, transcript);
  const incorrectClaims = normalizeIncorrectClaims(value && value.incorrect_claims, transcript);
  const normalizedRelations = normalizeRelationCandidates(value && value.relations, material, transcript);
  const relations = enforceCoreRelationConsistency(normalizedRelations, value, material);
  return {
    transcript,
    material,
    keyPoints,
    relations,
    incorrectClaims,
    coreIds: corePointIds(material),
    coreRelation: coreRelationDefinition(material),
    comprehensionFailure: hasComprehensionFailure(transcript)
  };
}

module.exports = {
  RELATION_STATUSES,
  COMPREHENSION_FAILURE_PATTERN,
  cleanText,
  groundedSpan,
  corePointIds,
  coreRelationDefinition,
  normalizeKeyPoints,
  normalizeRelationCandidates,
  normalizeIncorrectClaims,
  enforceCoreRelationConsistency,
  hasClearRelationSemanticSupport,
  hasComprehensionFailure,
  buildGroundedFacts
};
