const { findContextualLexicalMarkers } = require('./signal-analyzer');

const PROCESS_ISSUES = Object.freeze(['NONE', 'LEXICAL_RETRIEVAL', 'INFORMATION_ORDER']);
const ORDER_MARKER_PATTERN = /先|然后|再说|后来|最后|反正|不对|还是|等一下/g;

function locateAll(source, value) {
  const positions = [];
  if (!value) return positions;
  let cursor = 0;
  while ((cursor = source.indexOf(value, cursor)) >= 0) {
    positions.push({ text: value, start: cursor, end: cursor + value.length });
    cursor += Math.max(1, value.length);
  }
  return positions;
}

function expectedPointOrder(material, presentIds) {
  const ids = material.key_points.map((item) => item.id).filter((id) => presentIds.includes(id));
  const order = [];
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    const incoming = material.relations.filter((item) => item.to === id);
    incoming.forEach((item) => visit(item.from));
    visited.add(id);
    if (ids.includes(id)) order.push(id);
  }
  ids.forEach(visit);
  return order;
}

function reversedPairs(expected, observed) {
  const expectedIndex = new Map(expected.map((id, index) => [id, index]));
  const pairs = [];
  for (let left = 0; left < observed.length; left += 1) {
    for (let right = left + 1; right < observed.length; right += 1) {
      if (expectedIndex.get(observed[left]) > expectedIndex.get(observed[right])) {
        pairs.push([observed[left], observed[right]]);
      }
    }
  }
  return pairs;
}

function analyzeRetellingProcess({ transcript, material, taskResult }) {
  const source = String(transcript || '');
  const markers = findContextualLexicalMarkers(source).flatMap((marker) => locateAll(source, marker));
  const points = Array.isArray(taskResult && taskResult.keyPoints) ? taskResult.keyPoints : [];
  const covered = points.filter((item) => item.covered && item.start >= 0);
  const observedOrder = covered.slice().sort((a, b) => a.start - b.start).map((item) => item.id);
  const expectedOrder = expectedPointOrder(material, observedOrder);
  const reversed = reversedPairs(expectedOrder, observedOrder);
  const orderMarkers = Array.from(source.matchAll(ORDER_MARKER_PATTERN)).map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length
  }));
  const coreFactsPresent = taskResult && taskResult.coreFactsComplete === true;
  const requiresNewContent = !taskResult || taskResult.requiresNewContent === true;
  const relations = Array.isArray(taskResult && taskResult.relations) ? taskResult.relations : [];
  const coreRelation = relations.find((item) => item.id === 'R2') || null;
  const explicitWrongRelation = Boolean(coreRelation && coreRelation.status === 'INCORRECT');
  const hasIncorrectClaim = Boolean(taskResult && Array.isArray(taskResult.incorrectClaims)
    && taskResult.incorrectClaims.length);
  const structuralDisorder = reversed.length > 0
    && (orderMarkers.length >= 2 || observedOrder.length >= 3);
  const eligible = coreFactsPresent
    && !requiresNewContent
    && !hasIncorrectClaim
    && !explicitWrongRelation
    && (!coreRelation || coreRelation.status !== 'UNSUPPORTED')
    && structuralDisorder;
  const orderAnalysis = {
    eligible,
    coreFactsPresent,
    requiresNewContent,
    expectedOrder,
    observedOrder,
    reversedPairs: reversed,
    explicitWrongRelation
  };

  if (markers.length) {
    return {
      processIssue: 'LEXICAL_RETRIEVAL',
      lexicalMarkers: markers,
      orderAnalysis,
      evidence: markers.slice(0, 1),
      ruleId: 'PROCESS_CONTEXTUAL_LEXICAL_MARKER'
    };
  }
  if (eligible) {
    return {
      processIssue: 'INFORMATION_ORDER',
      lexicalMarkers: [],
      orderAnalysis,
      evidence: orderMarkers.length ? orderMarkers : covered.map((item) => ({
        text: item.evidence,
        start: item.start,
        end: item.end
      })),
      ruleId: 'PROCESS_REORDER_EXISTING_GROUNDED_FACTS'
    };
  }
  return {
    processIssue: 'NONE',
    lexicalMarkers: [],
    orderAnalysis,
    evidence: [],
    ruleId: 'PROCESS_NONE'
  };
}

module.exports = {
  PROCESS_ISSUES,
  locateAll,
  expectedPointOrder,
  reversedPairs,
  analyzeRetellingProcess
};
