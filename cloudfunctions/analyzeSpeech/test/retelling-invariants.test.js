const assert = require('assert');
const cases = require('../../../eval/retelling-cases');
const {
  validateRetellingEvaluation
} = require('../lib/retelling-evaluator');
const {
  validateRetellingProgress
} = require('../lib/retelling-progress-evaluator');

const material = cases[0].material;

function rawCandidate(options = {}) {
  return {
    core_meaning_clear: options.core === true,
    key_points: options.keyPoints || [],
    relations: options.relations || [],
    incorrect_claims: options.incorrectClaims || [],
    primary_training_need: options.need === undefined ? 'UNCERTAIN' : options.need,
    recommended_action: options.action || 'OBSERVE_AGAIN',
    evidence: options.evidence
      ? [{ text: options.evidence, type: 'invariant_probe' }]
      : [],
    reason: 'fixture'
  };
}

function finalEvaluation(transcript, raw) {
  return validateRetellingEvaluation(raw, { material, transcript });
}

function relation(status, fromEvidence = '', toEvidence = '', relationEvidence = '') {
  return {
    id: 'R2',
    status,
    from_evidence: fromEvidence,
    to_evidence: toEvidence,
    relation_evidence: relationEvidence
  };
}

const rawPassWithoutK2 = finalEvaluation('重要消息可能会漏掉。', rawCandidate({
  core: true,
  need: null,
  action: 'PASS',
  keyPoints: [{ id: 'K3', covered: true, evidence: '重要消息可能会漏掉' }]
}));
assert.notStrictEqual(rawPassWithoutK2.recommended_action, 'PASS');
assert.strictEqual(rawPassWithoutK2.core_meaning_clear, false);

const unsupportedOrder = finalEvaluation('通知很多。', rawCandidate({
  need: 'INFORMATION_ORDER',
  action: 'REORDER_CAUSAL_CHAIN',
  evidence: '通知很多',
  keyPoints: [{ id: 'K1', covered: true, evidence: '通知很多' }]
}));
assert.notStrictEqual(unsupportedOrder.primary_training_need, 'INFORMATION_ORDER');

const lexicalFalsePositive = finalEvaluation('这个事情怎么说都可以，通知很多。', rawCandidate({
  need: 'LEXICAL_RETRIEVAL',
  action: 'PARAPHRASE_AROUND_WORD',
  evidence: '怎么说都可以'
}));
assert.notStrictEqual(lexicalFalsePositive.primary_training_need, 'LEXICAL_RETRIEVAL');

const incorrectWithoutRelation = finalEvaluation('通知很多。', rawCandidate({
  need: 'INCORRECT_RELATION',
  action: 'RETHINK_RELATION',
  evidence: '通知很多',
  relations: [relation('INCORRECT')]
}));
assert.notStrictEqual(incorrectWithoutRelation.primary_training_need, 'INCORRECT_RELATION');
assert.strictEqual(incorrectWithoutRelation.relations.find((item) => item.id === 'R2').status, 'UNSUPPORTED');

const incorrectWithGroundedRelation = finalEvaluation(
  '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。',
  rawCandidate({
    need: 'INCORRECT_RELATION',
    action: 'RETHINK_RELATION',
    relations: [relation(
      'INCORRECT',
      '人后来才开始忽略普通通知',
      '重要消息经常被漏掉',
      '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知'
    )]
  })
);
assert.strictEqual(incorrectWithGroundedRelation.primary_training_need, 'INCORRECT_RELATION');
assert.strictEqual(incorrectWithGroundedRelation.recommended_action, 'RETHINK_RELATION');

const missingK2WithFalseR2 = finalEvaluation(
  '通知很多，所以重要消息容易漏掉。',
  rawCandidate({
    need: 'MISSING_CAUSAL_STEP',
    action: 'ADD_CAUSAL_LINK',
    evidence: '通知很多，所以重要消息容易漏掉',
    keyPoints: [
      { id: 'K1', covered: true, evidence: '通知很多' },
      { id: 'K3', covered: true, evidence: '重要消息容易漏掉' }
    ],
    relations: [relation('MISSING', '', '重要消息容易漏掉', '')],
    incorrectClaims: [{
      claim: '跳过中间机制',
      evidence: '通知很多，所以重要消息容易漏掉'
    }]
  })
);
assert.strictEqual(missingK2WithFalseR2.primary_training_need, 'MISSING_CAUSAL_STEP');
assert.strictEqual(missingK2WithFalseR2.recommended_action, 'ADD_CAUSAL_LINK');
assert.deepStrictEqual(missingK2WithFalseR2.relations.find((item) => item.id === 'R2'), {
  id: 'R2',
  status: 'MISSING',
  from_evidence: '',
  to_evidence: '重要消息容易漏掉',
  relation_evidence: ''
});

const missingK3WithFalseR2 = finalEvaluation(
  '人慢慢习惯忽略通知。',
  rawCandidate({
    need: 'INCORRECT_RELATION',
    action: 'RETHINK_RELATION',
    keyPoints: [{ id: 'K2', covered: true, evidence: '人慢慢习惯忽略通知' }],
    relations: [relation('MISSING', '人慢慢习惯忽略通知')]
  })
);
assert.notStrictEqual(missingK3WithFalseR2.primary_training_need, 'INCORRECT_RELATION');
assert.strictEqual(missingK3WithFalseR2.primary_training_need, 'MISSING_CAUSAL_STEP');

const missingBothWithFalseR2 = finalEvaluation(
  '通知。',
  rawCandidate({
    need: 'INCORRECT_RELATION',
    action: 'RETHINK_RELATION',
    evidence: '通知',
    relations: [relation('MISSING')]
  })
);
assert.notStrictEqual(missingBothWithFalseR2.primary_training_need, 'INCORRECT_RELATION');
assert.strictEqual(missingBothWithFalseR2.primary_training_need, 'UNCERTAIN');

const ungroundedIncorrectRelation = finalEvaluation(
  '重要消息经常被漏掉，人后来才开始忽略普通通知。',
  rawCandidate({
    need: 'INCORRECT_RELATION',
    action: 'RETHINK_RELATION',
    relations: [relation(
      'INCORRECT',
      '人后来才开始忽略普通通知',
      '重要消息经常被漏掉',
      '因为重要消息被漏掉，所以才忽略通知'
    )]
  })
);
assert.strictEqual(ungroundedIncorrectRelation.relations[1].status, 'UNSUPPORTED');
assert.notStrictEqual(ungroundedIncorrectRelation.primary_training_need, 'INCORRECT_RELATION');

const incorrectMissingEndpoint = finalEvaluation(
  '人后来才开始忽略普通通知。',
  rawCandidate({
    need: 'INCORRECT_RELATION',
    action: 'RETHINK_RELATION',
    relations: [relation(
      'INCORRECT',
      '人后来才开始忽略普通通知',
      '',
      '人后来才开始忽略普通通知'
    )]
  })
);
assert.strictEqual(incorrectMissingEndpoint.relations[1].status, 'UNSUPPORTED');
assert.notStrictEqual(incorrectMissingEndpoint.primary_training_need, 'INCORRECT_RELATION');

const correctUngroundedRelation = finalEvaluation(
  '人习惯忽略提醒，重要消息也容易漏掉。',
  rawCandidate({
    core: true,
    need: null,
    action: 'PASS',
    keyPoints: [
      { id: 'K2', covered: true, evidence: '人习惯忽略提醒' },
      { id: 'K3', covered: true, evidence: '重要消息也容易漏掉' }
    ],
    relations: [relation(
      'CORRECT',
      '人习惯忽略提醒',
      '重要消息也容易漏掉',
      '人习惯忽略提醒，所以重要消息也容易漏掉'
    )]
  })
);
assert.strictEqual(correctUngroundedRelation.relations[1].status, 'UNSUPPORTED');
assert.strictEqual(correctUngroundedRelation.core_meaning_clear, false);
assert.notStrictEqual(correctUngroundedRelation.recommended_action, 'PASS');

const firstTranscript = '通知很多，所以重要消息容易漏掉。';
const firstEvaluation = finalEvaluation(firstTranscript, rawCandidate({
  need: 'MISSING_CAUSAL_STEP',
  action: 'ADD_CAUSAL_LINK',
  evidence: '通知很多，所以重要消息容易漏掉',
  keyPoints: [
    { id: 'K1', covered: true, evidence: '通知很多' },
    { id: 'K3', covered: true, evidence: '重要消息容易漏掉' }
  ],
  relations: [relation('MISSING', '', '重要消息容易漏掉')]
}));

const incompleteSecondTranscript = '通知还是很多，重要消息也会漏。';
const incompleteSecondEvaluation = finalEvaluation(incompleteSecondTranscript, rawCandidate({
  need: 'MISSING_CAUSAL_STEP',
  action: 'ADD_CAUSAL_LINK',
  evidence: '通知还是很多，重要消息也会漏',
  keyPoints: [
    { id: 'K1', covered: true, evidence: '通知还是很多' },
    { id: 'K3', covered: true, evidence: '重要消息也会漏' }
  ],
  relations: [relation('MISSING', '', '重要消息也会漏')]
}));
const unresolved = validateRetellingProgress({
  original_training_need: 'MISSING_CAUSAL_STEP',
  resolved: true,
  before_evidence: '通知很多，所以重要消息容易漏掉',
  after_evidence: '通知还是很多，重要消息也会漏',
  improvement_type: 'CAUSAL_LINK_ADDED',
  core_meaning_clear_after: true,
  reason: 'fixture'
}, {
  material,
  first_transcript: firstTranscript,
  first_evaluation: firstEvaluation,
  second_transcript: incompleteSecondTranscript,
  second_evaluation: incompleteSecondEvaluation
});
assert.strictEqual(unresolved.resolved, false);

const completeSecondTranscript = '通知太多会让人习惯忽略提醒，所以重要消息也容易一起漏掉。';
const completeSecondEvaluation = finalEvaluation(completeSecondTranscript, rawCandidate({
  core: true,
  need: null,
  action: 'PASS',
  keyPoints: [
    { id: 'K2', covered: true, evidence: '通知太多会让人习惯忽略提醒' },
    { id: 'K3', covered: true, evidence: '重要消息也容易一起漏掉' }
  ],
  relations: [relation(
    'CORRECT',
    '通知太多会让人习惯忽略提醒',
    '重要消息也容易一起漏掉',
    '通知太多会让人习惯忽略提醒，所以重要消息也容易一起漏掉'
  )]
}));
const resolvedDespiteRawFalse = validateRetellingProgress({
  original_training_need: 'MISSING_CAUSAL_STEP',
  resolved: false,
  before_evidence: '通知很多，所以重要消息容易漏掉',
  after_evidence: '让人习惯忽略提醒，所以重要消息也容易一起漏掉',
  improvement_type: 'NO_CLEAR_CHANGE',
  core_meaning_clear_after: false,
  reason: 'fixture'
}, {
  material,
  first_transcript: firstTranscript,
  first_evaluation: firstEvaluation,
  second_transcript: completeSecondTranscript,
  second_evaluation: completeSecondEvaluation
});
assert.strictEqual(resolvedDespiteRawFalse.resolved, true);
assert.strictEqual(resolvedDespiteRawFalse.improvement_type, 'CAUSAL_LINK_ADDED');

const incorrectFirstTranscript = '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。';
const incorrectFirstEvaluation = finalEvaluation(incorrectFirstTranscript, rawCandidate({
  need: 'INCORRECT_RELATION',
  action: 'RETHINK_RELATION',
  evidence: '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知',
  relations: [relation(
    'INCORRECT',
    '人后来才开始忽略普通通知',
    '重要消息经常被漏掉',
    '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知'
  )]
}));
const correctedProgress = validateRetellingProgress({
  original_training_need: 'INCORRECT_RELATION',
  resolved: true,
  before_evidence: '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知',
  after_evidence: '人会习惯忽略提醒，所以重要消息也会漏掉',
  improvement_type: 'RELATION_CORRECTED',
  core_meaning_clear_after: true,
  reason: 'fixture'
}, {
  material,
  first_transcript: incorrectFirstTranscript,
  first_evaluation: incorrectFirstEvaluation,
  second_transcript: completeSecondTranscript,
  second_evaluation: completeSecondEvaluation
});
assert.strictEqual(correctedProgress.resolved, true);
assert.strictEqual(correctedProgress.improvement_type, 'RELATION_CORRECTED');

assert.strictEqual(
  completeSecondEvaluation.key_points.find((item) => item.id === 'K1').covered,
  false
);
assert.strictEqual(resolvedDespiteRawFalse.resolved, true);

const explicitLexical = finalEvaluation(
  '通知太多以后会那个……怎么说……就是看到也不想点。',
  rawCandidate({
    need: 'MISSING_CAUSAL_STEP',
    action: 'ADD_CAUSAL_LINK',
    evidence: '看到也不想点'
  })
);
assert.strictEqual(explicitLexical.primary_training_need, 'LEXICAL_RETRIEVAL');
console.log('retelling invariant tests passed');
