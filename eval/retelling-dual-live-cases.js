const legacyCases = require('./retelling-live-cases');

const GOLD = Object.freeze({
  L01: ['PASS', 'NONE', 'PASS'],
  L02: ['PASS', 'NONE', 'PASS'],
  L03: ['PASS', 'NONE', 'PASS'],
  L04: ['MISSING_CORE_CONTENT', 'NONE', 'MISSING_CAUSAL_STEP'],
  L05: ['MISSING_CORE_CONTENT', 'NONE', 'MISSING_CAUSAL_STEP'],
  L06: ['MISSING_CORE_CONTENT', 'NONE', 'MISSING_CAUSAL_STEP'],
  L07: ['INCORRECT_RELATION', 'NONE', 'INCORRECT_RELATION'],
  L08: ['INCORRECT_RELATION', 'NONE', 'INCORRECT_RELATION'],
  L09: ['RELATION_NOT_ESTABLISHED', 'INFORMATION_ORDER', 'INFORMATION_ORDER'],
  L10: ['RELATION_NOT_ESTABLISHED', 'INFORMATION_ORDER', 'INFORMATION_ORDER'],
  L11: ['MISSING_CORE_CONTENT', 'LEXICAL_RETRIEVAL', 'LEXICAL_RETRIEVAL'],
  L12: ['MISSING_CORE_CONTENT', 'LEXICAL_RETRIEVAL', 'LEXICAL_RETRIEVAL'],
  L13: ['PASS', 'NONE', 'PASS'],
  L14: ['UNCERTAIN', 'NONE', 'UNCERTAIN'],
  L15: ['UNCERTAIN', 'NONE', 'UNCERTAIN'],
  L16: ['MISSING_CORE_CONTENT', 'NONE', 'MISSING_CAUSAL_STEP']
});

module.exports = Object.freeze(legacyCases.map((item) => {
  const [task, process, routed] = GOLD[item.id];
  return Object.freeze({
    id: item.id,
    material: item.material,
    transcript: item.transcript,
    gold: Object.freeze({ task, process, routed }),
    labels: item.labels
  });
}));
