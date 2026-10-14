function requireText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value.trim().slice(0, maxLength);
}

function readEventField(event, camelCaseName, snakeCaseName) {
  return event[snakeCaseName] !== undefined ? event[snakeCaseName] : event[camelCaseName];
}

function validateEvent(event) {
  const source = event || {};
  const rawRequiredSlots = readEventField(source, 'questionRequiredSlots', 'question_required_slots');
  return {
    fileID: requireText(readEventField(source, 'fileID', 'file_id'), 'fileID', 1024),
    questionId: requireText(readEventField(source, 'questionId', 'question_id'), 'questionId', 64),
    questionText: requireText(readEventField(source, 'questionText', 'question_text'), 'questionText', 500),
    questionCategory: requireText(readEventField(source, 'questionCategory', 'question_category'), 'questionCategory', 64),
    questionOpenness: ['LOW', 'MEDIUM', 'HIGH'].includes(readEventField(source, 'questionOpenness', 'question_openness'))
      ? readEventField(source, 'questionOpenness', 'question_openness')
      : 'MEDIUM',
    questionTaskType: typeof readEventField(source, 'questionTaskType', 'question_task_type') === 'string'
      ? readEventField(source, 'questionTaskType', 'question_task_type').trim().slice(0, 64)
      : '',
    questionRequiredSlots: (Array.isArray(rawRequiredSlots) ? rawRequiredSlots : [])
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, 10)
      .map((item) => item.trim().slice(0, 64)),
    sessionId: requireText(readEventField(source, 'sessionId', 'session_id'), 'sessionId', 128),
    roundId: requireText(readEventField(source, 'roundId', 'round_id'), 'roundId', 128),
    clientAudioDuration: Number(readEventField(source, 'clientAudioDuration', 'client_audio_duration')) || 0,
    audioRetentionConsent: readEventField(source, 'audioRetentionConsent', 'audio_retention_consent') === true
  };
}

function validateInterventionCheckEvent(event) {
  const source = event || {};
  const rawRequiredSlots = readEventField(source, 'questionRequiredSlots', 'question_required_slots');
  return {
    intervention_type: requireText(
      readEventField(source, 'interventionType', 'intervention_type'),
      'interventionType',
      64
    ),
    before_transcript: requireText(
      readEventField(source, 'beforeTranscript', 'before_transcript'),
      'beforeTranscript',
      2000
    ),
    after_transcript: requireText(
      readEventField(source, 'afterTranscript', 'after_transcript'),
      'afterTranscript',
      2000
    ),
    anchor: typeof readEventField(source, 'anchor', 'anchor') === 'string'
      ? readEventField(source, 'anchor', 'anchor').trim().slice(0, 120)
      : '',
    phase: typeof readEventField(source, 'phase', 'phase') === 'string'
      ? readEventField(source, 'phase', 'phase').trim().slice(0, 64)
      : 'COMPLETE_INTERVENTION',
    original_question: typeof readEventField(source, 'originalQuestion', 'original_question') === 'string'
      ? readEventField(source, 'originalQuestion', 'original_question').trim().slice(0, 500)
      : '',
    question_task_type: typeof readEventField(source, 'questionTaskType', 'question_task_type') === 'string'
      ? readEventField(source, 'questionTaskType', 'question_task_type').trim().slice(0, 64)
      : '',
    question_required_slots: (Array.isArray(rawRequiredSlots) ? rawRequiredSlots : [])
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, 10)
      .map((item) => item.trim().slice(0, 64)),
    slot_state: readEventField(source, 'slotState', 'slot_state') || {},
    target_slot: typeof readEventField(source, 'targetSlot', 'target_slot') === 'string'
      ? readEventField(source, 'targetSlot', 'target_slot').trim().slice(0, 64)
      : '',
    current_prompt: typeof readEventField(source, 'currentPrompt', 'current_prompt') === 'string'
      ? readEventField(source, 'currentPrompt', 'current_prompt').trim().slice(0, 500)
      : ''
  };
}

function validateRetellingMaterial(rawMaterial) {
  const source = rawMaterial && typeof rawMaterial === 'object' ? rawMaterial : {};
  const rawKeyPoints = Array.isArray(source.key_points) ? source.key_points : source.keyPoints;
  const rawRelations = Array.isArray(source.relations) ? source.relations : [];
  const keyPoints = (Array.isArray(rawKeyPoints) ? rawKeyPoints : []).map((item) => {
    const rawAnchors = item && (item.semantic_anchors || item.semanticAnchors);
    const point = {
      id: requireText(item && item.id, 'retellingKeyPointId', 16),
      role: requireText(item && item.role, 'retellingKeyPointRole', 32),
      text: requireText(item && item.text, 'retellingKeyPointText', 500)
    };
    if (rawAnchors !== undefined) {
      if (!Array.isArray(rawAnchors)) throw new Error('INVALID_RETELLING_SEMANTIC_ANCHORS');
      point.semantic_anchors = rawAnchors.slice(0, 12)
        .map((anchor) => requireText(anchor, 'retellingSemanticAnchor', 160));
    }
    const displayText = item && (item.display_text || item.displayText);
    if (typeof displayText === 'string' && displayText.trim()) {
      point.display_text = displayText.trim().slice(0, 500);
    }
    return point;
  });
  const relations = rawRelations.map((item) => ({
    id: requireText(item && item.id, 'retellingRelationId', 16),
    from: requireText(item && item.from, 'retellingRelationFrom', 16),
    to: requireText(item && item.to, 'retellingRelationTo', 16),
    type: requireText(item && item.type, 'retellingRelationType', 32)
  }));
  const keyPointIds = new Set(keyPoints.map((item) => item.id));
  const relationIds = new Set(relations.map((item) => item.id));
  const k2 = keyPoints.find((item) => item.id === 'K2');
  const k3 = keyPoints.find((item) => item.id === 'K3');
  const r2 = relations.find((item) => item.id === 'R2');
  if (!/^retelling_\d{3}$/.test(source.id)
    || keyPoints.length !== 5
    || ['K1', 'K2', 'K3', 'K4', 'K5'].some((id) => !keyPointIds.has(id))
    || !k2 || k2.role !== 'CORE'
    || !k3 || k3.role !== 'CORE'
    || !relationIds.has('R1') || !r2
    || r2.from !== 'K2' || r2.to !== 'K3'
    || relations.some((item) => !keyPointIds.has(item.from) || !keyPointIds.has(item.to))) {
    throw new Error('INVALID_RETELLING_MATERIAL');
  }
  return {
    id: source.id,
    title: requireText(source.title, 'retellingTitle', 200),
    core_message: requireText(source.core_message || source.coreMessage, 'retellingCoreMessage', 1000),
    key_points: keyPoints,
    relations
  };
}

function validateRetellingEvaluationEvent(event) {
  const source = event || {};
  return {
    material: validateRetellingMaterial(source.material),
    transcript: requireText(source.transcript, 'retellingTranscript', 4000)
  };
}

function validateRetellingProgressEvent(event) {
  const source = event || {};
  const firstRoundResult = source.first_round_result || source.firstRoundResult;
  if (!firstRoundResult || typeof firstRoundResult !== 'object'
    || !firstRoundResult.taskResult || typeof firstRoundResult.taskResult !== 'object'
    || !firstRoundResult.processResult || typeof firstRoundResult.processResult !== 'object'
    || !firstRoundResult.routedResult || typeof firstRoundResult.routedResult !== 'object') {
    throw new Error('INVALID_FIRST_ROUND_RESULT');
  }
  const originalTrainingNeed = requireText(
    source.original_training_need || source.originalTrainingNeed,
    'originalTrainingNeed',
    64
  );
  const supportedNeeds = [
    'MISSING_CAUSAL_STEP',
    'INCORRECT_RELATION',
    'LEXICAL_RETRIEVAL',
    'INFORMATION_ORDER',
    'UNCERTAIN',
    'WORDING_PRECISION',
    'FORMULATION_BREAKDOWN',
    'CONCEPT_INACCURACY'
  ];
  if (!supportedNeeds.includes(originalTrainingNeed)
    || firstRoundResult.routedResult.primaryTrainingNeed !== originalTrainingNeed) {
    throw new Error('INVALID_ORIGINAL_TRAINING_NEED');
  }
  const expectedRetryScope = ['WORDING_PRECISION', 'FORMULATION_BREAKDOWN']
    .includes(originalTrainingNeed)
    ? 'TARGET_EXPRESSION'
    : 'FULL_CONTENT';
  const suppliedRetryScope = source.original_retry_scope || source.originalRetryScope
    || firstRoundResult.routedResult.retryScope;
  const originalRetryScope = suppliedRetryScope || expectedRetryScope;
  if (originalRetryScope !== expectedRetryScope) {
    throw new Error('INVALID_ORIGINAL_RETRY_SCOPE');
  }
  const canonicalConceptTarget = firstRoundResult.routedResult.conceptTarget
    || (firstRoundResult.taskResult && firstRoundResult.taskResult.conceptInaccuracy)
    || null;
  const canonicalExpressionTarget = ['WORDING_PRECISION', 'FORMULATION_BREAKDOWN']
    .includes(originalTrainingNeed)
    ? {
      issue: firstRoundResult.processResult.expressionIssue,
      userEvidence: firstRoundResult.processResult.userEvidence || null,
      materialEvidence: firstRoundResult.processResult.materialEvidence || null,
      relatedKeyPointIds: Array.isArray(firstRoundResult.processResult.relatedKeyPointIds)
        ? firstRoundResult.processResult.relatedKeyPointIds
        : [],
      reasonCode: firstRoundResult.processResult.reasonCode || '',
      confidence: firstRoundResult.processResult.confidence || 'LOW'
    }
    : null;
  const suppliedExpressionTarget = source.original_expression_target || source.originalExpressionTarget;
  if (suppliedExpressionTarget && canonicalExpressionTarget) {
    const suppliedIds = Array.isArray(suppliedExpressionTarget.relatedKeyPointIds)
      ? suppliedExpressionTarget.relatedKeyPointIds
      : [];
    const canonicalUserText = canonicalExpressionTarget.userEvidence
      && canonicalExpressionTarget.userEvidence.text;
    const suppliedUserText = suppliedExpressionTarget.userEvidence
      && suppliedExpressionTarget.userEvidence.text;
    if ((suppliedExpressionTarget.issue || suppliedExpressionTarget.expressionIssue)
        !== canonicalExpressionTarget.issue
      || suppliedUserText !== canonicalUserText
      || JSON.stringify(suppliedIds) !== JSON.stringify(canonicalExpressionTarget.relatedKeyPointIds)) {
      throw new Error('ORIGINAL_EXPRESSION_TARGET_MISMATCH');
    }
  }
  const suppliedConceptTarget = source.original_concept_target || source.originalConceptTarget;
  if (suppliedConceptTarget && canonicalConceptTarget) {
    const suppliedIds = Array.isArray(suppliedConceptTarget.relatedKeyPointIds)
      ? suppliedConceptTarget.relatedKeyPointIds
      : [];
    const canonicalIds = Array.isArray(canonicalConceptTarget.relatedKeyPointIds)
      ? canonicalConceptTarget.relatedKeyPointIds
      : [];
    const canonicalUserText = canonicalConceptTarget.userEvidence
      && canonicalConceptTarget.userEvidence.text;
    const suppliedUserText = suppliedConceptTarget.userEvidence
      && suppliedConceptTarget.userEvidence.text;
    if (suppliedUserText !== canonicalUserText
      || JSON.stringify(suppliedIds) !== JSON.stringify(canonicalIds)) {
      throw new Error('ORIGINAL_CONCEPT_TARGET_MISMATCH');
    }
  }
  const originalConceptTarget = canonicalConceptTarget;
  const originalExpressionTarget = canonicalExpressionTarget;
  return {
    material: validateRetellingMaterial(source.material),
    firstRoundResult: Object.assign({}, firstRoundResult, {
      transcript: requireText(firstRoundResult.transcript, 'firstTranscript', 4000)
    }),
    originalTrainingNeed,
    originalRetryScope,
    originalConceptTarget,
    originalExpressionTarget,
    secondTranscript: requireText(
      source.second_transcript || source.secondTranscript,
      'secondTranscript',
      4000
    )
  };
}

module.exports = {
  validateEvent,
  validateInterventionCheckEvent,
  validateRetellingEvaluationEvent,
  validateRetellingProgressEvent,
  readEventField
};
