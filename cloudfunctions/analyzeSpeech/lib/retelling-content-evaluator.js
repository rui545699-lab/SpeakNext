const {
  callDeepSeek,
  parseEvaluatorResponse,
  MAX_EVALUATOR_RETRIES
} = require('./deepseek-evaluator');
const {
  RETELLING_CONTENT_PROMPT_VERSION,
  RETELLING_CONTENT_SYSTEM_PROMPT
} = require('../config/retelling-content-prompt');
const { applyRelationConsistencyRepair } = require('./retelling-evaluator');
const {
  RELATION_STATUSES,
  groundedSpan,
  normalizeKeyPoints,
  normalizeRelationCandidates: normalizeRelations,
  normalizeIncorrectClaims,
  buildGroundedFacts,
  hasClearRelationSemanticSupport
} = require('./retelling-grounded-facts');
const { normalizeConceptInaccuracy } = require('./retelling-concept-analyzer');

const TASK_STATUSES = Object.freeze([
  'PASS',
  'MISSING_CORE_CONTENT',
  'RELATION_NOT_ESTABLISHED',
  'INCORRECT_RELATION',
  'CONCEPT_INACCURACY',
  'UNCERTAIN'
]);
const RETRYABLE_OUTPUT_ERRORS = new Set([
  'EMPTY_MODEL_OUTPUT',
  'OUTPUT_TRUNCATED',
  'OUTPUT_PARSE_ERROR'
]);

function createRetellingContentPayload(model, input, systemPrompt = RETELLING_CONTENT_SYSTEM_PROMPT) {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请仅用 JSON 评估以下复述：\n${JSON.stringify(input)}` }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: 1800
  };
}

function deriveTaskStatus(material, keyPoints, relations, incorrectClaims, options = {}) {
  const coreIds = material.key_points.filter((item) => item.role === 'CORE').map((item) => item.id);
  const missingCorePointIds = coreIds.filter((id) => {
    const point = keyPoints.find((item) => item.id === id);
    return !point || !point.covered;
  });
  const coreFactsComplete = missingCorePointIds.length === 0;
  const coreRelationDefinitions = material.relations.filter((item) => (
    coreIds.includes(item.from) && coreIds.includes(item.to)
  ));
  const coreRelations = coreRelationDefinitions
    .map((definition) => relations.find((item) => item.id === definition.id))
    .filter(Boolean);
  const coreRelation = coreRelations[0] || null;
  const relevantGroundedContent = keyPoints.some((item) => item.covered && item.evidence)
    || relations.some((item) => item.fromEvidence || item.toEvidence || item.relationEvidence);
  const relationSemanticSupport = hasClearRelationSemanticSupport(coreRelation, options.transcript);
  let taskStatus;

  if (coreRelations.some((item) => item.status === 'INCORRECT')) taskStatus = 'INCORRECT_RELATION';
  else if (options.conceptInaccuracy && options.conceptInaccuracy.detected) taskStatus = 'CONCEPT_INACCURACY';
  else if (incorrectClaims.length) taskStatus = 'INCORRECT_RELATION';
  else if (coreRelations.some((item) => item.status === 'UNSUPPORTED')) taskStatus = 'UNCERTAIN';
  else if (options.comprehensionFailure || !relevantGroundedContent) taskStatus = 'UNCERTAIN';
  else if (!coreFactsComplete) taskStatus = 'MISSING_CORE_CONTENT';
  else if (coreRelation && coreRelation.status === 'CORRECT' && relationSemanticSupport) taskStatus = 'PASS';
  else if (coreRelation && (coreRelation.status === 'MISSING'
    || (coreRelation.status === 'CORRECT' && !relationSemanticSupport))) {
    taskStatus = 'RELATION_NOT_ESTABLISHED';
  } else taskStatus = 'UNCERTAIN';

  return {
    taskStatus,
    coreMeaningClear: taskStatus === 'PASS',
    coreFactsComplete,
    missingCorePointIds,
    requiresNewContent: taskStatus === 'MISSING_CORE_CONTENT'
  };
}

function validateRetellingContent(value, input) {
  if (!value || typeof value !== 'object') throw new Error('RETELLING_CONTENT_OUTPUT_INVALID');
  const facts = buildGroundedFacts(value, input);
  const conceptInaccuracy = normalizeConceptInaccuracy({
    transcript: facts.transcript,
    material: facts.material,
    rawEvaluation: value
  });
  const state = deriveTaskStatus(
    facts.material,
    facts.keyPoints,
    facts.relations,
    facts.incorrectClaims,
    {
      transcript: facts.transcript,
      comprehensionFailure: facts.comprehensionFailure,
      conceptInaccuracy
    }
  );
  return Object.assign({}, state, {
    keyPoints: facts.keyPoints,
    relations: facts.relations,
    incorrectClaims: facts.incorrectClaims,
    conceptInaccuracy
  });
}

async function evaluateRetellingContent(input, request = callDeepSeek, options = {}) {
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const payload = createRetellingContentPayload(model, input, options.systemPrompt);
  let retryCount = 0;
  while (retryCount <= MAX_EVALUATOR_RETRIES) {
    try {
      const response = await request(payload);
      const parsed = parseEvaluatorResponse(response);
      const repair = await applyRelationConsistencyRepair(model, input, parsed.parsed, request);
      return {
        taskResult: validateRetellingContent(repair.evaluation, input),
        rawEvaluation: parsed.parsed,
        repairedEvaluation: repair.repairCount ? repair.evaluation : null,
        modelVersion: response.model || model,
        promptVersion: options.promptVersion || RETELLING_CONTENT_PROMPT_VERSION,
        requestId: parsed.metadata.requestId,
        retryCount,
        relationRepairCount: repair.repairCount,
        relationRepairIssues: repair.issues,
        relationRepairRemainingIssues: repair.remainingIssues
      };
    } catch (error) {
      const type = error && (error.outputErrorType || error.message);
      if (!RETRYABLE_OUTPUT_ERRORS.has(type) || retryCount >= MAX_EVALUATOR_RETRIES) throw error;
      retryCount += 1;
    }
  }
  throw new Error('RETELLING_CONTENT_EVALUATION_FAILED');
}

module.exports = {
  TASK_STATUSES,
  RELATION_STATUSES,
  groundedSpan,
  createRetellingContentPayload,
  normalizeKeyPoints,
  normalizeRelations,
  normalizeIncorrectClaims,
  deriveTaskStatus,
  validateRetellingContent,
  evaluateRetellingContent
};
