const {
  callDeepSeek,
  parseEvaluatorResponse,
  MAX_EVALUATOR_RETRIES
} = require('./deepseek-evaluator');
const {
  TRAINING_NEEDS,
  isGrounded,
  hasCoreCausalChain
} = require('./retelling-evaluator');
const { findContextualLexicalMarkers } = require('./signal-analyzer');
const { RETELLING_PROGRESS_SYSTEM_PROMPT } = require('../config/retelling-progress-prompt');

const IMPROVEMENT_TYPES = Object.freeze([
  'CAUSAL_LINK_ADDED',
  'RELATION_CORRECTED',
  'ORDER_CLARIFIED',
  'LEXICAL_BLOCK_RESOLVED',
  'EVIDENCE_CLARIFIED',
  'NO_CLEAR_CHANGE'
]);
const RETRYABLE_OUTPUT_ERRORS = new Set([
  'EMPTY_MODEL_OUTPUT',
  'OUTPUT_TRUNCATED',
  'OUTPUT_PARSE_ERROR'
]);
const IMPROVEMENT_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: 'CAUSAL_LINK_ADDED',
  INCORRECT_RELATION: 'RELATION_CORRECTED',
  INFORMATION_ORDER: 'ORDER_CLARIFIED',
  LEXICAL_RETRIEVAL: 'LEXICAL_BLOCK_RESOLVED',
  UNCERTAIN: 'EVIDENCE_CLARIFIED'
});

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function createRetellingProgressPayload(model, input) {
  return {
    model,
    messages: [
      { role: 'system', content: RETELLING_PROGRESS_SYSTEM_PROMPT },
      { role: 'user', content: `请仅用 JSON 判断以下第二次复述是否解决原训练问题：\n${JSON.stringify(input)}` }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: 1200
  };
}

function findItem(items, id) {
  return (Array.isArray(items) ? items : []).find((item) => item && item.id === id) || null;
}

function deriveProgressResolved(originalNeed, secondEvaluation, secondTranscript) {
  const evaluation = secondEvaluation && typeof secondEvaluation === 'object'
    ? secondEvaluation
    : {};
  const facts = {
    transcript: secondTranscript,
    keyPoints: Array.isArray(evaluation.key_points) ? evaluation.key_points : [],
    relations: Array.isArray(evaluation.relations) ? evaluation.relations : [],
    incorrectClaims: Array.isArray(evaluation.incorrect_claims) ? evaluation.incorrect_claims : []
  };
  const k2 = findItem(facts.keyPoints, 'K2');
  const k3 = findItem(facts.keyPoints, 'K3');
  const r2 = findItem(facts.relations, 'R2');
  const coreChainClear = hasCoreCausalChain(facts);

  if (originalNeed === 'MISSING_CAUSAL_STEP') return coreChainClear;
  if (originalNeed === 'INCORRECT_RELATION') {
    return Boolean(r2 && r2.status === 'CORRECT' && facts.incorrectClaims.length === 0);
  }
  if (originalNeed === 'LEXICAL_RETRIEVAL') {
    const coreMeaningContinues = Boolean((k2 && k2.covered) || (k3 && k3.covered)
      || (r2 && r2.status === 'CORRECT'));
    return findContextualLexicalMarkers(secondTranscript).length === 0 && coreMeaningContinues;
  }
  if (originalNeed === 'INFORMATION_ORDER') {
    return evaluation.primary_training_need !== 'INFORMATION_ORDER' && coreChainClear;
  }
  return coreChainClear;
}

function groundedFallback(transcript, candidate, fallbackCandidates) {
  if (isGrounded(transcript, candidate)) return candidate;
  return (Array.isArray(fallbackCandidates) ? fallbackCandidates : [])
    .find((item) => isGrounded(transcript, item)) || '';
}

function validateRetellingProgress(value, input) {
  if (!value || typeof value !== 'object') throw new Error('RETELLING_PROGRESS_OUTPUT_INVALID');
  const firstTranscript = cleanText(input && input.first_transcript, 4000);
  const secondTranscript = cleanText(input && input.second_transcript, 4000);
  const originalNeed = input && input.first_evaluation
    ? input.first_evaluation.primary_training_need
    : null;
  if (!TRAINING_NEEDS.includes(originalNeed) || !firstTranscript || !secondTranscript) {
    throw new Error('RETELLING_PROGRESS_INPUT_INVALID');
  }

  const secondEvaluation = input.second_evaluation;
  if (!secondEvaluation || typeof secondEvaluation !== 'object') {
    throw new Error('RETELLING_SECOND_EVALUATION_REQUIRED');
  }
  const firstEvidence = Array.isArray(input.first_evaluation.evidence)
    ? input.first_evaluation.evidence.map((item) => item && item.text)
    : [];
  const relationEvidence = Array.isArray(secondEvaluation.relations)
    ? secondEvaluation.relations.flatMap((item) => item
      ? [item.relation_evidence, item.from_evidence, item.to_evidence]
      : [])
    : [];
  const keyPointEvidence = Array.isArray(secondEvaluation.key_points)
    ? secondEvaluation.key_points.map((item) => item && item.evidence)
    : [];
  const beforeEvidence = groundedFallback(
    firstTranscript,
    cleanText(value.before_evidence),
    firstEvidence
  );
  const afterEvidence = groundedFallback(
    secondTranscript,
    cleanText(value.after_evidence),
    relationEvidence.concat(keyPointEvidence)
  );
  const rawOriginalNeedMatches = value.original_training_need === originalNeed;
  const deterministicallyResolved = deriveProgressResolved(
    originalNeed,
    secondEvaluation,
    secondTranscript
  );
  const resolved = rawOriginalNeedMatches
    && Boolean(beforeEvidence)
    && Boolean(afterEvidence)
    && deterministicallyResolved;
  const secondFacts = {
    transcript: secondTranscript,
    keyPoints: Array.isArray(secondEvaluation.key_points) ? secondEvaluation.key_points : [],
    relations: Array.isArray(secondEvaluation.relations) ? secondEvaluation.relations : [],
    incorrectClaims: Array.isArray(secondEvaluation.incorrect_claims)
      ? secondEvaluation.incorrect_claims
      : []
  };

  return {
    original_training_need: originalNeed,
    resolved,
    before_evidence: beforeEvidence,
    after_evidence: afterEvidence,
    improvement_type: resolved ? IMPROVEMENT_BY_NEED[originalNeed] : 'NO_CLEAR_CHANGE',
    core_meaning_clear_after: hasCoreCausalChain(secondFacts),
    reason: resolved
      ? '第二次复述已经解决本轮聚焦的问题。'
      : '第二次复述还没有提供足够证据证明本轮问题已解决。'
  };
}

async function evaluateRetellingProgress(input, request = callDeepSeek) {
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const payload = createRetellingProgressPayload(model, input);
  let retryCount = 0;
  while (retryCount <= MAX_EVALUATOR_RETRIES) {
    try {
      const response = await request(payload);
      const parsed = parseEvaluatorResponse(response);
      return {
        evaluation: validateRetellingProgress(parsed.parsed, input),
        rawEvaluation: parsed.parsed,
        modelVersion: response.model || model,
        requestId: parsed.metadata.requestId,
        retryCount
      };
    } catch (error) {
      const type = error && (error.outputErrorType || error.message);
      if (!RETRYABLE_OUTPUT_ERRORS.has(type) || retryCount >= MAX_EVALUATOR_RETRIES) throw error;
      retryCount += 1;
    }
  }
  throw new Error('RETELLING_PROGRESS_EVALUATION_FAILED');
}

module.exports = {
  IMPROVEMENT_TYPES,
  createRetellingProgressPayload,
  validateRetellingProgress,
  evaluateRetellingProgress,
  deriveProgressResolved
};
