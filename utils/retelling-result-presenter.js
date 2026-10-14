'use strict';

const PRESENTATION_TYPES = Object.freeze({
  CAUSAL_CHAIN: 'CAUSAL_CHAIN',
  RELATION_DIRECTION: 'RELATION_DIRECTION',
  LEXICAL_PARAPHRASE: 'LEXICAL_PARAPHRASE',
  ORDER_SEQUENCE: 'ORDER_SEQUENCE',
  UNCERTAIN_SIMPLE: 'UNCERTAIN_SIMPLE',
  EXPRESSION_TARGET: 'EXPRESSION_TARGET'
});

const TITLE_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: '关键原因补上了',
  INCORRECT_RELATION: '因果关系理顺了',
  LEXICAL_RETRIEVAL: '这次没有卡在那个词上',
  INFORMATION_ORDER: '表达顺序理顺了',
  UNCERTAIN: '本轮完成',
  WORDING_PRECISION: '这个说法更准确了',
  FORMULATION_BREAKDOWN: '这句话说完整了',
  CONCEPT_INACCURACY: '这个意思说准确了'
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function transcriptOf(roundResult) {
  return text(roundResult && roundResult.transcript);
}

function transcriptItem(roundResult, value) {
  const source = transcriptOf(roundResult);
  const grounded = text(value);
  if (!grounded || !source.includes(grounded)) return null;
  return { text: grounded, source: 'TRANSCRIPT' };
}

function pointOf(roundResult, id) {
  const points = roundResult && roundResult.taskResult && roundResult.taskResult.keyPoints;
  return Array.isArray(points) ? points.find((item) => item && item.id === id) || null : null;
}

function relationOf(roundResult, id) {
  const relations = roundResult && roundResult.taskResult && roundResult.taskResult.relations;
  return Array.isArray(relations) ? relations.find((item) => item && item.id === id) || null : null;
}

function groundedPointItem(roundResult, id) {
  const point = pointOf(roundResult, id);
  if (!point || point.covered !== true) return null;
  const item = transcriptItem(roundResult, point.evidence);
  return item ? Object.assign({}, item, { keyPointId: id }) : null;
}

function relationIsGrounded(roundResult, relation) {
  if (!relation) return false;
  return Boolean(
    transcriptItem(roundResult, relation.fromEvidence)
    && transcriptItem(roundResult, relation.toEvidence)
    && transcriptItem(roundResult, relation.relationEvidence)
  );
}

function materialItem(material, id) {
  const points = material && material.keyPoints;
  const point = Array.isArray(points) ? points.find((item) => item && item.id === id) : null;
  const value = text(point && (point.displayText || point.text));
  return value ? { text: value, source: 'MATERIAL', keyPointId: id } : null;
}

function withLast(items) {
  return items.map((item, index) => Object.assign({}, item, { last: index === items.length - 1 }));
}

function getMaterialCoreChain(material) {
  const items = ['K1', 'K2', 'K3'].map((id) => materialItem(material, id)).filter(Boolean);
  return items.length === 3 ? withLast(items) : [];
}

function fallback(title, presentationType) {
  return {
    title,
    beforeItems: [],
    afterItems: [],
    summary: '',
    presentationType,
    showChange: false
  };
}

function presentMissing(input) {
  const { firstRoundResult, secondRoundResult } = input;
  const title = TITLE_BY_NEED.MISSING_CAUSAL_STEP;
  const secondRelation = relationOf(secondRoundResult, 'R2');
  const firstCoreItems = ['K2', 'K3']
    .map((id) => groundedPointItem(firstRoundResult, id))
    .filter(Boolean);
  const secondCoreItems = ['K2', 'K3']
    .map((id) => groundedPointItem(secondRoundResult, id))
    .filter(Boolean);
  const firstCoveredIds = new Set(firstCoreItems.map((item) => item.keyPointId));
  const newlyCoveredCoreIds = secondCoreItems
    .map((item) => item.keyPointId)
    .filter((id) => !firstCoveredIds.has(id));
  if (!firstCoreItems.length
    || secondCoreItems.length !== 2
    || !newlyCoveredCoreIds.length
    || !secondRelation
    || secondRelation.status !== 'CORRECT'
    || !relationIsGrounded(secondRoundResult, secondRelation)) {
    return fallback(title, PRESENTATION_TYPES.CAUSAL_CHAIN);
  }
  return {
    title,
    beforeItems: withLast(firstCoreItems),
    afterItems: withLast(secondCoreItems),
    summary: '第二次把中间的原因补完整了。',
    presentationType: PRESENTATION_TYPES.CAUSAL_CHAIN,
    showChange: true
  };
}

function relationSequence(roundResult, expectedStatus) {
  const relation = relationOf(roundResult, 'R2');
  if (!relation || relation.status !== expectedStatus || !relationIsGrounded(roundResult, relation)) return [];
  const from = transcriptItem(roundResult, relation.fromEvidence);
  const to = transcriptItem(roundResult, relation.toEvidence);
  const source = transcriptOf(roundResult);
  return withLast([from, to].sort((left, right) => source.indexOf(left.text) - source.indexOf(right.text)));
}

function presentIncorrect(input) {
  const title = TITLE_BY_NEED.INCORRECT_RELATION;
  const beforeItems = relationSequence(input.firstRoundResult, 'INCORRECT');
  const afterItems = relationSequence(input.secondRoundResult, 'CORRECT');
  if (beforeItems.length < 2 || afterItems.length < 2) {
    return fallback(title, PRESENTATION_TYPES.RELATION_DIRECTION);
  }
  return {
    title,
    beforeItems,
    afterItems,
    summary: '第二次把原因和结果的方向理顺了。',
    presentationType: PRESENTATION_TYPES.RELATION_DIRECTION,
    showChange: true
  };
}

function firstLexicalMarker(roundResult) {
  const process = roundResult && roundResult.processResult;
  const markers = process && process.lexicalMarkers;
  if (!Array.isArray(markers)) return null;
  for (const marker of markers) {
    const item = transcriptItem(roundResult, marker && marker.text);
    if (item) return item;
  }
  return null;
}

function secondParaphrase(input) {
  const progressEvidence = transcriptItem(input.secondRoundResult, input.progressResult.afterEvidence);
  if (progressEvidence) return progressEvidence;
  const relation = relationOf(input.secondRoundResult, 'R2');
  if (relation && relation.status === 'CORRECT' && relationIsGrounded(input.secondRoundResult, relation)) {
    return transcriptItem(input.secondRoundResult, relation.relationEvidence);
  }
  return groundedPointItem(input.secondRoundResult, 'K2')
    || groundedPointItem(input.secondRoundResult, 'K3');
}

function presentLexical(input) {
  const title = TITLE_BY_NEED.LEXICAL_RETRIEVAL;
  const before = firstLexicalMarker(input.firstRoundResult);
  const after = secondParaphrase(input);
  if (!before || !after) return fallback(title, PRESENTATION_TYPES.LEXICAL_PARAPHRASE);
  return {
    title,
    beforeItems: withLast([before]),
    afterItems: withLast([after]),
    summary: '第二次换了一种说法，意思也保留下来了。',
    presentationType: PRESENTATION_TYPES.LEXICAL_PARAPHRASE,
    showChange: true
  };
}

function groundedPointsInOrder(roundResult) {
  const points = roundResult && roundResult.taskResult && roundResult.taskResult.keyPoints;
  if (!Array.isArray(points)) return [];
  return withLast(points
    .filter((point) => point && point.covered === true && transcriptItem(roundResult, point.evidence))
    .map((point) => ({
      item: transcriptItem(roundResult, point.evidence),
      start: Number.isInteger(point.start) ? point.start : transcriptOf(roundResult).indexOf(point.evidence)
    }))
    .filter((entry) => entry.start >= 0)
    .sort((left, right) => left.start - right.start)
    .slice(0, 3)
    .map((entry) => entry.item));
}

function presentOrder(input) {
  const title = TITLE_BY_NEED.INFORMATION_ORDER;
  const beforeItems = groundedPointsInOrder(input.firstRoundResult);
  const afterItems = groundedPointsInOrder(input.secondRoundResult);
  if (beforeItems.length < 2 || afterItems.length < 2) {
    return fallback(title, PRESENTATION_TYPES.ORDER_SEQUENCE);
  }
  return {
    title,
    beforeItems,
    afterItems,
    summary: '同样的信息，第二次的顺序更清楚。',
    presentationType: PRESENTATION_TYPES.ORDER_SEQUENCE,
    showChange: true
  };
}

function presentExpression(input, need) {
  const firstProcess = input.firstRoundResult && input.firstRoundResult.processResult;
  const targetIds = Array.isArray(firstProcess && firstProcess.relatedKeyPointIds)
    ? firstProcess.relatedKeyPointIds
    : [];
  const before = transcriptItem(input.firstRoundResult, firstProcess
    && firstProcess.userEvidence && firstProcess.userEvidence.text);
  const after = transcriptItem(
    input.secondRoundResult,
    input.progressResult && input.progressResult.afterEvidence
  ) || targetIds.map((id) => groundedPointItem(input.secondRoundResult, id)).find(Boolean);
  const title = TITLE_BY_NEED[need];
  if (!before || !after) return fallback(title, PRESENTATION_TYPES.EXPRESSION_TARGET);
  return {
    title,
    beforeItems: withLast([before]),
    afterItems: withLast([after]),
    summary: need === 'WORDING_PRECISION'
      ? '第二次保留了原来的意思，也把这个地方说准了。'
      : '第二次保留了原来的意思，也把这句话说完整了。',
    presentationType: PRESENTATION_TYPES.EXPRESSION_TARGET,
    showChange: true
  };
}

function presentConcept(input) {
  const firstConcept = (input.firstRoundResult && input.firstRoundResult.routedResult
    && input.firstRoundResult.routedResult.conceptTarget)
    || (input.firstRoundResult && input.firstRoundResult.taskResult
      && input.firstRoundResult.taskResult.conceptInaccuracy);
  const targetIds = Array.isArray(firstConcept && firstConcept.relatedKeyPointIds)
    ? firstConcept.relatedKeyPointIds
    : [];
  const before = transcriptItem(input.firstRoundResult, firstConcept
    && firstConcept.userEvidence && firstConcept.userEvidence.text);
  const after = targetIds.map((id) => groundedPointItem(input.secondRoundResult, id)).find(Boolean);
  const title = TITLE_BY_NEED.CONCEPT_INACCURACY;
  if (!before || !after) return fallback(title, PRESENTATION_TYPES.EXPRESSION_TARGET);
  return {
    title,
    beforeItems: withLast([before]),
    afterItems: withLast([after]),
    summary: '第二次保留了相关内容，也把这个意思说准确了。',
    presentationType: PRESENTATION_TYPES.EXPRESSION_TARGET,
    showChange: true
  };
}

function presentRetellingResult(input = {}) {
  const progressResult = input.progressResult || {};
  if (progressResult.resolved !== true || !input.firstRoundResult || !input.secondRoundResult) return null;
  switch (input.originalTrainingNeed) {
    case 'MISSING_CAUSAL_STEP': return presentMissing(input);
    case 'INCORRECT_RELATION': return presentIncorrect(input);
    case 'LEXICAL_RETRIEVAL': return presentLexical(input);
    case 'INFORMATION_ORDER': return presentOrder(input);
    case 'WORDING_PRECISION': return presentExpression(input, 'WORDING_PRECISION');
    case 'FORMULATION_BREAKDOWN': return presentExpression(input, 'FORMULATION_BREAKDOWN');
    case 'CONCEPT_INACCURACY': return presentConcept(input);
    case 'UNCERTAIN':
      return fallback(TITLE_BY_NEED.UNCERTAIN, PRESENTATION_TYPES.UNCERTAIN_SIMPLE);
    default: return null;
  }
}

module.exports = {
  PRESENTATION_TYPES,
  getMaterialCoreChain,
  materialItem,
  presentRetellingResult
};
