const {
  callDeepSeek,
  parseEvaluatorResponse,
  MAX_EVALUATOR_RETRIES
} = require('./deepseek-evaluator');
const {
  RETELLING_EVALUATOR_SYSTEM_PROMPT,
  RETELLING_RELATION_REPAIR_SYSTEM_PROMPT
} = require('../config/retelling-evaluator-prompt');
const { findContextualLexicalMarkers } = require('./signal-analyzer');

const TRAINING_NEEDS = Object.freeze([
  'MISSING_CAUSAL_STEP',
  'INCORRECT_RELATION',
  'INFORMATION_ORDER',
  'LEXICAL_RETRIEVAL',
  'UNCERTAIN'
]);
const RELATION_STATUSES = Object.freeze([
  'CORRECT',
  'INCORRECT',
  'MISSING',
  'UNSUPPORTED'
]);
const ACTION_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: 'ADD_CAUSAL_LINK',
  INCORRECT_RELATION: 'RETHINK_RELATION',
  INFORMATION_ORDER: 'REORDER_CAUSAL_CHAIN',
  LEXICAL_RETRIEVAL: 'PARAPHRASE_AROUND_WORD',
  UNCERTAIN: 'OBSERVE_AGAIN'
});
const REASON_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: '核心结果已经出现，但中间的因果连接还不清楚。',
  INCORRECT_RELATION: '当前复述中的关键因果方向与材料不一致。',
  INFORMATION_ORDER: '当前信息顺序使核心因果关系难以辨认。',
  LEXICAL_RETRIEVAL: '当前复述有明确的找词中断。',
  UNCERTAIN: '现有表达证据不足，暂时无法可靠判断具体问题。'
});
const RETRYABLE_OUTPUT_ERRORS = new Set([
  'EMPTY_MODEL_OUTPUT',
  'OUTPUT_TRUNCATED',
  'OUTPUT_PARSE_ERROR'
]);

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isGrounded(transcript, evidence) {
  const source = String(transcript || '');
  const candidate = text(evidence);
  return Boolean(candidate) && source.includes(candidate);
}

function createRetellingPayload(model, input) {
  return {
    model,
    messages: [
      { role: 'system', content: RETELLING_EVALUATOR_SYSTEM_PROMPT },
      { role: 'user', content: `请仅用 JSON 评估以下复述：\n${JSON.stringify(input)}` }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: 1800
  };
}

function findRelationConsistencyIssues(value, options = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const relations = Array.isArray(source.relations) ? source.relations : [];
  const r2 = relations.find((item) => item && item.id === 'R2') || null;
  const issues = [];
  if (options.includePrimaryNeedMismatch !== false
    && source.primary_training_need === 'INCORRECT_RELATION'
    && (!r2 || r2.status !== 'INCORRECT')) {
    issues.push('PRIMARY_NEED_R2_STATUS_MISMATCH');
  }
  relations.forEach((relation) => {
    if (!relation || (relation.status !== 'CORRECT' && relation.status !== 'INCORRECT')) return;
    if (!text(relation.from_evidence)) issues.push(`${relation.id || 'UNKNOWN'}_FROM_EVIDENCE_MISSING`);
    if (!text(relation.to_evidence)) issues.push(`${relation.id || 'UNKNOWN'}_TO_EVIDENCE_MISSING`);
    if (!text(relation.relation_evidence)) issues.push(`${relation.id || 'UNKNOWN'}_RELATION_EVIDENCE_MISSING`);
  });
  return issues;
}

function createRelationRepairPayload(model, input, rawEvaluation, issues) {
  const repairIssues = (Array.isArray(issues) ? issues : []).map((issue) => (
    issue === 'PRIMARY_NEED_R2_STATUS_MISMATCH'
      ? 'R2_STATUS_REVIEW_REQUIRED'
      : issue
  ));
  return {
    model,
    messages: [
      { role: 'system', content: RETELLING_RELATION_REPAIR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `请只修复 relation 结构字段：\n${JSON.stringify({
          material: input && input.material,
          transcript: input && input.transcript,
          relations: rawEvaluation && rawEvaluation.relations,
          consistency_issues: repairIssues
        })}`
      }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: 700
  };
}

function mergeRelationRepair(rawEvaluation, repairValue) {
  const source = rawEvaluation && typeof rawEvaluation === 'object' ? rawEvaluation : {};
  const repairedRelations = repairValue && Array.isArray(repairValue.relations)
    ? repairValue.relations
    : source.relations;
  return Object.assign({}, source, { relations: repairedRelations });
}

async function applyRelationConsistencyRepair(model, input, rawEvaluation, request) {
  const issues = findRelationConsistencyIssues(rawEvaluation);
  if (!issues.length) {
    return {
      evaluation: rawEvaluation,
      repairCount: 0,
      issues,
      remainingIssues: [],
      requestId: ''
    };
  }

  try {
    const response = await request(createRelationRepairPayload(model, input, rawEvaluation, issues));
    const parsed = parseEvaluatorResponse(response);
    const repaired = mergeRelationRepair(rawEvaluation, parsed.parsed);
    return {
      evaluation: repaired,
      repairCount: 1,
      issues,
      remainingIssues: findRelationConsistencyIssues(repaired, {
        includePrimaryNeedMismatch: false
      }),
      requestId: parsed.metadata.requestId
    };
  } catch (error) {
    return {
      evaluation: rawEvaluation,
      repairCount: 1,
      issues,
      remainingIssues: issues,
      requestId: ''
    };
  }
}

function normalizeKeyPoints(value, material, transcript) {
  const candidates = Array.isArray(value) ? value : [];
  return material.key_points.map((definition) => {
    const candidate = candidates.find((item) => item && item.id === definition.id) || {};
    const evidence = text(candidate.evidence);
    const covered = candidate.covered === true && isGrounded(transcript, evidence);
    return { id: definition.id, covered, evidence: covered ? evidence : '' };
  });
}

function normalizeRelations(value, material, transcript) {
  const candidates = Array.isArray(value) ? value : [];
  return material.relations.map((definition) => {
    const candidate = candidates.find((item) => item && item.id === definition.id) || {};
    const fromEvidence = text(candidate.from_evidence);
    const toEvidence = text(candidate.to_evidence);
    const relationEvidence = text(candidate.relation_evidence);
    const groundedFrom = isGrounded(transcript, fromEvidence);
    const groundedTo = isGrounded(transcript, toEvidence);
    const groundedRelation = isGrounded(transcript, relationEvidence);
    const rawStatus = RELATION_STATUSES.includes(candidate.status)
      ? candidate.status
      : 'UNSUPPORTED';
    const status = (rawStatus === 'CORRECT' || rawStatus === 'INCORRECT')
      && !(groundedFrom && groundedTo && groundedRelation)
      ? 'UNSUPPORTED'
      : rawStatus;
    return {
      id: definition.id,
      status,
      from_evidence: groundedFrom ? fromEvidence : '',
      to_evidence: groundedTo ? toEvidence : '',
      relation_evidence: groundedRelation ? relationEvidence : ''
    };
  });
}

function normalizeIncorrectClaims(value, transcript) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && isGrounded(transcript, item.evidence))
    .slice(0, 5)
    .map((item) => {
      const evidence = text(item.evidence);
      return { claim: evidence, evidence };
    });
}

function normalizePrimaryEvidence(value, transcript) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && isGrounded(transcript, item.text))
    .slice(0, 3)
    .map((item) => ({
      text: text(item.text, 300),
      type: text(item.type, 64) || 'retelling_evidence'
    }));
}

function findItem(items, id) {
  return (Array.isArray(items) ? items : []).find((item) => item && item.id === id) || null;
}

function evidenceItem(textValue, type) {
  return textValue ? [{ text: textValue, type }] : [];
}

function hasGroundedOrderSupport(transcript, keyPoints, rawNeed, primaryEvidence) {
  if (rawNeed !== 'INFORMATION_ORDER' || !primaryEvidence.length) return false;
  const k2 = findItem(keyPoints, 'K2');
  const k3 = findItem(keyPoints, 'K3');
  if (!k2 || !k2.covered || !k3 || !k3.covered) return false;
  const k2Index = transcript.indexOf(k2.evidence);
  const k3Index = transcript.indexOf(k3.evidence);
  const reversedCoreOrder = k2Index >= 0 && k3Index >= 0 && k3Index < k2Index;
  const orderMarkerCount = (transcript.match(/先|然后|再说|后来|最后|反正|不对|还是|等一下/g) || []).length;
  return reversedCoreOrder || orderMarkerCount >= 2;
}

function hasCoreCausalChain(facts) {
  const k2 = findItem(facts.keyPoints, 'K2');
  const k3 = findItem(facts.keyPoints, 'K3');
  const r2 = findItem(facts.relations, 'R2');
  return Boolean(k2 && k2.covered && k3 && k3.covered
    && r2 && r2.status === 'CORRECT'
    && r2.from_evidence && r2.to_evidence && r2.relation_evidence
    && facts.incorrectClaims.length === 0);
}

function deriveFinalRetellingPass(facts) {
  return hasCoreCausalChain(facts)
    && findContextualLexicalMarkers(facts.transcript).length === 0;
}

function hasGroundedIncorrectCoreRelation(facts) {
  const r2 = findItem(facts.relations, 'R2');
  return Boolean(r2 && r2.status === 'INCORRECT'
    && r2.from_evidence && r2.to_evidence && r2.relation_evidence);
}

function deriveFinalRetellingNeed(facts) {
  const lexicalMarkers = findContextualLexicalMarkers(facts.transcript);
  if (lexicalMarkers.length) {
    return {
      need: 'LEXICAL_RETRIEVAL',
      evidence: evidenceItem(lexicalMarkers[0], 'explicit_lexical_retrieval')
    };
  }

  const r2 = findItem(facts.relations, 'R2');
  if (hasGroundedIncorrectCoreRelation(facts)) {
    return {
      need: 'INCORRECT_RELATION',
      evidence: evidenceItem(r2.relation_evidence, 'incorrect_core_relation')
    };
  }

  if (facts.incorrectClaims.length === 0
    && hasGroundedOrderSupport(
      facts.transcript,
      facts.keyPoints,
      facts.rawNeed,
      facts.primaryEvidence
    )) {
    return {
      need: 'INFORMATION_ORDER',
      evidence: facts.primaryEvidence.slice(0, 1)
    };
  }

  if (r2 && r2.status === 'UNSUPPORTED') {
    return {
      need: 'UNCERTAIN',
      evidence: facts.primaryEvidence.slice(0, 1)
    };
  }

  const relevantPoint = facts.keyPoints.find((item) => item.covered && item.evidence);
  const missingRelationEvidence = r2 && r2.status === 'MISSING'
    ? (r2.from_evidence || r2.to_evidence)
    : '';
  if (missingRelationEvidence || relevantPoint) {
    return {
      need: 'MISSING_CAUSAL_STEP',
      evidence: facts.primaryEvidence.length
        ? facts.primaryEvidence.slice(0, 1)
        : evidenceItem(
          missingRelationEvidence || relevantPoint.evidence,
          'grounded_retelling_point'
        )
    };
  }

  return {
    need: 'UNCERTAIN',
    evidence: facts.primaryEvidence.slice(0, 1)
  };
}

function validateRetellingEvaluation(value, input) {
  if (!value || typeof value !== 'object') throw new Error('RETELLING_OUTPUT_INVALID');
  const transcript = text(input && input.transcript, 4000);
  const material = input && input.material;
  if (!transcript || !material || !Array.isArray(material.key_points) || !Array.isArray(material.relations)) {
    throw new Error('RETELLING_INPUT_INVALID');
  }

  const keyPoints = normalizeKeyPoints(value.key_points, material, transcript);
  const relations = normalizeRelations(value.relations, material, transcript);
  const incorrectClaims = normalizeIncorrectClaims(value.incorrect_claims, transcript);
  const primaryEvidence = normalizePrimaryEvidence(value.evidence, transcript);
  const facts = {
    transcript,
    keyPoints,
    relations,
    incorrectClaims,
    primaryEvidence,
    rawNeed: TRAINING_NEEDS.includes(value.primary_training_need)
      ? value.primary_training_need
      : null
  };
  const coreMeaningClear = deriveFinalRetellingPass(facts);

  if (coreMeaningClear) {
    return {
      core_meaning_clear: true,
      key_points: keyPoints,
      relations,
      incorrect_claims: [],
      primary_training_need: null,
      recommended_action: 'PASS',
      evidence: [],
      reason: '核心因果关系已经表达清楚。'
    };
  }

  const derived = deriveFinalRetellingNeed(facts);
  const need = derived.need;
  return {
    core_meaning_clear: false,
    key_points: keyPoints,
    relations,
    incorrect_claims: incorrectClaims,
    primary_training_need: need,
    recommended_action: ACTION_BY_NEED[need],
    evidence: derived.evidence,
    reason: REASON_BY_NEED[need]
  };
}

async function evaluateRetelling(input, request = callDeepSeek) {
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const payload = createRetellingPayload(model, input);
  let retryCount = 0;
  while (retryCount <= MAX_EVALUATOR_RETRIES) {
    try {
      const response = await request(payload);
      const parsed = parseEvaluatorResponse(response);
      const repair = await applyRelationConsistencyRepair(
        model,
        input,
        parsed.parsed,
        request
      );
      return {
        evaluation: validateRetellingEvaluation(repair.evaluation, input),
        rawEvaluation: parsed.parsed,
        repairedEvaluation: repair.repairCount ? repair.evaluation : null,
        modelVersion: response.model || model,
        requestId: parsed.metadata.requestId,
        retryCount,
        relationRepairCount: repair.repairCount,
        relationRepairIssues: repair.issues,
        relationRepairRemainingIssues: repair.remainingIssues,
        relationRepairRequestId: repair.requestId
      };
    } catch (error) {
      const type = error && (error.outputErrorType || error.message);
      if (!RETRYABLE_OUTPUT_ERRORS.has(type) || retryCount >= MAX_EVALUATOR_RETRIES) throw error;
      retryCount += 1;
    }
  }
  throw new Error('RETELLING_EVALUATION_FAILED');
}

module.exports = {
  TRAINING_NEEDS,
  RELATION_STATUSES,
  ACTION_BY_NEED,
  createRetellingPayload,
  createRelationRepairPayload,
  findRelationConsistencyIssues,
  mergeRelationRepair,
  applyRelationConsistencyRepair,
  validateRetellingEvaluation,
  evaluateRetelling,
  isGrounded,
  deriveFinalRetellingPass,
  hasCoreCausalChain,
  hasGroundedIncorrectCoreRelation,
  deriveFinalRetellingNeed,
  hasGroundedOrderSupport
};
