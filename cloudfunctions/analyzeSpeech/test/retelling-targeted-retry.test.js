'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const {
  analyzeRetellingExpression,
  normalizeTargetRetryEvaluation
} = require('../lib/retelling-expression-analyzer');
const {
  routeRetellingTrainingV057,
  RETRY_SCOPES
} = require('../lib/retelling-training-router');
const { resolveRetellingProgress } = require('../lib/retelling-progress-resolver');
const { validateRetellingProgressEvent } = require('../lib/validation');

const material = materialPayload(materials.find((item) => item.id === 'retelling_001'));

function span(text, source) {
  const start = source.indexOf(text);
  return { text, start, end: start + text.length };
}

function task(status, options = {}) {
  return {
    taskStatus: status,
    coreFactsComplete: options.coreFactsComplete === true,
    missingCorePointIds: options.missingCorePointIds || [],
    keyPoints: options.keyPoints || [],
    relations: options.relations || [],
    incorrectClaims: options.incorrectClaims || [],
    conceptInaccuracy: options.conceptInaccuracy || { detected: false }
  };
}

function formulationProcess(transcript, options = {}) {
  const evidence = options.evidence || '叫什么来着';
  return {
    processIssue: 'NONE',
    expressionIssue: 'FORMULATION_BREAKDOWN',
    reasonCode: options.reasonCode || 'WORD_SEARCH_INTERRUPTION',
    confidence: options.confidence || 'HIGH',
    userEvidence: span(evidence, transcript),
    materialEvidence: options.materialEvidence === undefined
      ? { text: '激活高温感受器', start: 0, end: 8, field: 'key_points.K2' }
      : options.materialEvidence,
    relatedKeyPointIds: options.relatedKeyPointIds === undefined ? ['K2'] : options.relatedKeyPointIds,
    evidence: []
  };
}

// Expression target binding is normalized from the same model response, without another call.
const interruptedTranscript = '辣椒素会刺激一个叫什么来着，反正就是一种感受器，所以会觉得辣。';
const boundExpression = analyzeRetellingExpression({
  transcript: interruptedTranscript,
  material,
  taskResult: task('UNCERTAIN'),
  rawEvaluation: {
    expression_diagnosis: {
      issue: 'FORMULATION_BREAKDOWN',
      reason_code: 'WORD_SEARCH_INTERRUPTION',
      user_evidence: '叫什么来着',
      material_evidence: '激活高温感受器',
      related_key_point_ids: ['K2'],
      confidence: 'HIGH'
    }
  }
});
assert.strictEqual(boundExpression.expressionIssue, 'FORMULATION_BREAKDOWN');
assert.strictEqual(boundExpression.materialEvidence.text, '激活高温感受器');
assert.deepStrictEqual(boundExpression.relatedKeyPointIds, ['K2']);

const repeatedWordingTranscript = '感受器处理高温刺激。';
const repeatedWordingRaw = {
  expression_diagnosis: {
    issue: 'WORDING_PRECISION',
    reason_code: 'IMPRECISE_MECHANISM_WORD',
    user_evidence: '处理高温刺激',
    material_evidence: '激活 TRPV1 感受器',
    related_key_point_ids: ['K2'],
    confidence: 'HIGH'
  }
};
assert.strictEqual(analyzeRetellingExpression({
  transcript: repeatedWordingTranscript,
  material,
  taskResult: task('MISSING_CORE_CONTENT'),
  rawEvaluation: repeatedWordingRaw
}).expressionIssue, 'NONE');
assert.strictEqual(analyzeRetellingExpression({
  transcript: repeatedWordingTranscript,
  material,
  taskResult: task('MISSING_CORE_CONTENT'),
  rawEvaluation: repeatedWordingRaw,
  retryContext: {
    originalTrainingNeed: 'WORDING_PRECISION',
    originalRetryScope: 'TARGET_EXPRESSION',
    originalExpressionTarget: { relatedKeyPointIds: ['K2'] }
  }
}).expressionIssue, 'WORDING_PRECISION');

// G. Fully grounded HIGH formulation may safely override Task UNCERTAIN.
let routed = routeRetellingTrainingV057(
  task('UNCERTAIN'),
  formulationProcess(interruptedTranscript)
);
assert.strictEqual(routed.primaryTrainingNeed, 'FORMULATION_BREAKDOWN');
assert.strictEqual(routed.retryScope, RETRY_SCOPES.TARGET_EXPRESSION);
assert.strictEqual(routed.ruleId, 'ROUTE_GROUNDED_FORMULATION_OVER_UNCERTAIN');

// H. Unbound formulation remains conservative UNCERTAIN.
routed = routeRetellingTrainingV057(
  task('UNCERTAIN'),
  formulationProcess(interruptedTranscript, { materialEvidence: null, relatedKeyPointIds: [] })
);
assert.strictEqual(routed.primaryTrainingNeed, 'UNCERTAIN');
assert.strictEqual(routed.retryScope, RETRY_SCOPES.FULL_CONTENT);

routed = routeRetellingTrainingV057(
  task('UNCERTAIN'),
  formulationProcess(interruptedTranscript, { confidence: 'MEDIUM' })
);
assert.strictEqual(routed.primaryTrainingNeed, 'UNCERTAIN');

routed = routeRetellingTrainingV057(
  task('UNCERTAIN'),
  formulationProcess(interruptedTranscript, {
    materialEvidence: { text: '错误绑定', start: 0, end: 4, field: 'key_points.K3' },
    relatedKeyPointIds: ['K2']
  })
);
assert.strictEqual(routed.primaryTrainingNeed, 'UNCERTAIN');

// I. Missing Content retains priority and full-content retry.
routed = routeRetellingTrainingV057(
  task('MISSING_CORE_CONTENT'),
  formulationProcess(interruptedTranscript)
);
assert.strictEqual(routed.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
assert.strictEqual(routed.retryScope, RETRY_SCOPES.FULL_CONTENT);

// J. Concept error retains priority and full-content retry.
routed = routeRetellingTrainingV057(
  task('CONCEPT_INACCURACY', { conceptInaccuracy: { detected: true } }),
  formulationProcess(interruptedTranscript)
);
assert.strictEqual(routed.primaryTrainingNeed, 'CONCEPT_INACCURACY');
assert.strictEqual(routed.retryScope, RETRY_SCOPES.FULL_CONTENT);

// K. Filler-only expression never enters targeted retry.
routed = routeRetellingTrainingV057(task('UNCERTAIN'), {
  processIssue: 'NONE', expressionIssue: 'NONE', reasonCode: 'EXPRESSION_NONE',
  confidence: 'LOW', userEvidence: null, materialEvidence: null, relatedKeyPointIds: []
});
assert.strictEqual(routed.primaryTrainingNeed, 'UNCERTAIN');
assert.strictEqual(routed.retryScope, RETRY_SCOPES.FULL_CONTENT);

function point(id, transcript, covered) {
  return {
    id,
    covered,
    evidence: covered ? transcript : '',
    start: covered ? 0 : -1,
    end: covered ? transcript.length : -1
  };
}

function expressionRound(transcript, issue, options = {}) {
  const coveredIds = options.coveredIds || [];
  const targetId = options.targetId || 'K2';
  const targetEvidence = options.targetEvidence || transcript;
  const evidenceStart = transcript.indexOf(targetEvidence);
  return {
    transcript,
    taskResult: {
      taskStatus: options.taskStatus || 'MISSING_CORE_CONTENT',
      coreFactsComplete: coveredIds.includes('K2') && coveredIds.includes('K3'),
      keyPoints: ['K1', 'K2', 'K3', 'K4', 'K5']
        .map((id) => point(id, transcript, coveredIds.includes(id))),
      relations: [],
      incorrectClaims: options.incorrectClaims || [],
      conceptInaccuracy: options.conceptInaccuracy || { detected: false }
    },
    processResult: {
      processIssue: 'NONE',
      expressionIssue: issue,
      reasonCode: issue === 'NONE' ? 'EXPRESSION_NONE' : 'WORD_SEARCH_INTERRUPTION',
      confidence: issue === 'NONE' ? 'LOW' : 'HIGH',
      userEvidence: issue === 'NONE' ? null : {
        text: targetEvidence,
        start: evidenceStart,
        end: evidenceStart + targetEvidence.length
      },
      materialEvidence: issue === 'NONE' ? null : {
        text: '目标材料语义', start: 0, end: 6, field: `key_points.${targetId}`
      },
      relatedKeyPointIds: issue === 'NONE' ? [] : [targetId],
      targetRetryEvaluation: options.targetRetained === undefined ? null : {
        applicable: true,
        targetRetained: options.targetRetained,
        targetEvidence: options.targetRetryEvidence === null
          ? null
          : span(options.targetRetryEvidence || transcript, transcript),
        meaningChanged: options.meaningChanged === true,
        reasonCode: options.targetRetryReason || 'TARGET_RETENTION_EVALUATED',
        relatedKeyPointIds: [targetId]
      }
    },
    routedResult: { primaryTrainingNeed: issue === 'NONE' ? 'PASS' : issue, evidence: [] }
  };
}

const firstFormulation = expressionRound(interruptedTranscript, 'FORMULATION_BREAKDOWN', {
  coveredIds: ['K2'], targetEvidence: '叫什么来着', taskStatus: 'UNCERTAIN'
});
const formulationTarget = firstFormulation.processResult;

// Older clients without retryScope are migrated in-memory; conflicting scopes are rejected.
const migrated = validateRetellingProgressEvent({
  material,
  first_round_result: firstFormulation,
  original_training_need: 'FORMULATION_BREAKDOWN',
  second_transcript: '辣椒素会激活和高温有关的感受器。'
});
assert.strictEqual(migrated.originalRetryScope, 'TARGET_EXPRESSION');
assert.throws(() => validateRetellingProgressEvent({
  material,
  first_round_result: firstFormulation,
  original_training_need: 'FORMULATION_BREAKDOWN',
  original_retry_scope: 'FULL_CONTENT',
  second_transcript: '辣椒素会激活和高温有关的感受器。'
}), /INVALID_ORIGINAL_RETRY_SCOPE/);

// A. A local K2 repair resolves despite naturally incomplete second-round Task content.
let progress = resolveRetellingProgress({
  originalTrainingNeed: 'FORMULATION_BREAKDOWN',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: formulationTarget,
  firstRoundResult: firstFormulation,
  secondRoundResult: expressionRound('辣椒素会激活与高温刺激有关的感受器。', 'NONE', {
    coveredIds: [], taskStatus: 'UNCERTAIN', targetRetained: true
  })
});
assert.strictEqual(progress.resolved, true);
assert.strictEqual(progress.reasonCode, 'FORMULATION_COMPLETED');

// B. Removing K2 cannot create a false improvement.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'FORMULATION_BREAKDOWN',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: formulationTarget,
  firstRoundResult: firstFormulation,
  secondRoundResult: expressionRound('所以最后会觉得辣。', 'NONE', {
    coveredIds: ['K3'], taskStatus: 'MISSING_CORE_CONTENT', targetRetained: false
  })
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'TARGET_CONTENT_REMOVED');

const firstWording = expressionRound('所以听到的东西不太一样。', 'WORDING_PRECISION', {
  coveredIds: ['K3'], targetId: 'K3', targetEvidence: '听到的东西不太一样', taskStatus: 'PASS'
});
firstWording.processResult.reasonCode = 'VAGUE_REFERENCE';

// C. The real-device wording repair resolves even when Content marks every key point uncovered.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('录音和平时听到的声音成分不一样。', 'NONE', {
    coveredIds: [], taskStatus: 'UNCERTAIN', targetRetained: true
  })
});
assert.strictEqual(progress.resolved, true);
assert.strictEqual(progress.reasonCode, 'WORDING_REFINED');
assert.strictEqual(progress.afterEvidence, '录音和平时听到的声音成分不一样。');

// Natural semantic paraphrase is also retained without exact wording or key-point coverage.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('两个情况下听到的声音组成不完全一样。', 'NONE', {
    coveredIds: [], taskStatus: 'UNCERTAIN', targetRetained: true
  })
});
assert.strictEqual(progress.resolved, true);
assert.strictEqual(progress.reasonCode, 'WORDING_REFINED');

progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('听到的东西还是不太一样。', 'WORDING_PRECISION', {
    coveredIds: ['K3'], targetId: 'K3', targetEvidence: '听到的东西还是不太一样',
    taskStatus: 'MISSING_CORE_CONTENT', targetRetained: true
  })
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'WORDING_PRECISION_STILL_PRESENT');

// D. Deleting the target meaning remains unresolved.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('所以最后感觉很陌生。', 'NONE', {
    coveredIds: ['K2'], taskStatus: 'MISSING_CORE_CONTENT', targetRetained: false
  })
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'TARGET_CONTENT_REMOVED');

// A related object with changed target meaning is not accepted as retention.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('录音的时候声音会变得更响。', 'NONE', {
    coveredIds: [], taskStatus: 'UNCERTAIN', targetRetained: false, meaningChanged: true
  })
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'TARGET_MEANING_CHANGED');

// Concept safety remains higher priority than a retained target.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('录音和平时听到的声音成分不一样。', 'NONE', {
    coveredIds: [], taskStatus: 'CONCEPT_INACCURACY', targetRetained: true,
    conceptInaccuracy: {
      detected: true,
      relatedKeyPointIds: ['K3'],
      userEvidence: span('声音成分不一样', '录音和平时听到的声音成分不一样。')
    }
  })
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'TARGET_CONCEPT_INACCURATE');

// Invalid or absent retention output uses grounded key points, then stays conservative.
progress = resolveRetellingProgress({
  originalTrainingNeed: 'WORDING_PRECISION',
  originalRetryScope: 'TARGET_EXPRESSION',
  originalExpressionTarget: firstWording.processResult,
  firstRoundResult: firstWording,
  secondRoundResult: expressionRound('只说了一句无法判断的话。', 'NONE', {
    coveredIds: [], taskStatus: 'UNCERTAIN'
  })
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'TARGET_RETENTION_UNCERTAIN');

// Normalization accepts only grounded continuous evidence from the current transcript.
const retainedRaw = {
  target_retry_evaluation: {
    applicable: true,
    target_retained: true,
    target_evidence: '声音组成不完全一样',
    meaning_changed: false,
    reason_code: 'TARGET_MEANING_RETAINED'
  }
};
assert.strictEqual(normalizeTargetRetryEvaluation({
  transcript: '两个情况下听到的声音组成不完全一样。',
  retryContext: { retryScope: 'TARGET_EXPRESSION', relatedKeyPointIds: ['K3'] },
  rawEvaluation: retainedRaw
}).targetRetained, true);
assert.strictEqual(normalizeTargetRetryEvaluation({
  transcript: '录音的时候声音会变得更响。',
  retryContext: { retryScope: 'TARGET_EXPRESSION', relatedKeyPointIds: ['K3'] },
  rawEvaluation: retainedRaw
}), null);

// Mocked semantic-boundary outputs keep paraphrase, deletion and meaning-change distinct.
function normalizedBoundary(transcript, targetRetained, meaningChanged, reasonCode) {
  return normalizeTargetRetryEvaluation({
    transcript,
    retryContext: {
      trainingNeed: 'WORDING_PRECISION',
      retryScope: 'TARGET_EXPRESSION',
      relatedKeyPointIds: ['K3'],
      targetUserEvidence: '听到的东西不太一样',
      targetMaterialEvidence: '听到的声音成分不同'
    },
    rawEvaluation: {
      target_retry_evaluation: {
        applicable: true,
        target_retained: targetRetained,
        target_evidence: transcript,
        meaning_changed: meaningChanged,
        reason_code: reasonCode
      }
    }
  });
}

[
  '录音和平时听到的声音成分不一样。',
  '这两种情况下听到的声音组成不同。',
  '平时和录音里听到的声音成分有差别。'
].forEach((transcript) => {
  const normalized = normalizedBoundary(transcript, true, false, 'TARGET_MEANING_RETAINED');
  assert.strictEqual(normalized.targetRetained, true);
  assert.strictEqual(normalized.meaningChanged, false);
  assert.strictEqual(normalized.reasonCode, 'TARGET_MEANING_RETAINED');
});

let boundary = normalizedBoundary(
  '所以录音里的自己会觉得陌生。',
  false,
  false,
  'TARGET_DELETED'
);
assert.strictEqual(boundary.targetRetained, false);
assert.strictEqual(boundary.meaningChanged, false);
assert.strictEqual(boundary.reasonCode, 'TARGET_DELETED');

boundary = normalizedBoundary(
  '录音里的声音会变得更响。',
  false,
  true,
  'TARGET_MEANING_CHANGED'
);
assert.strictEqual(boundary.targetRetained, false);
assert.strictEqual(boundary.meaningChanged, true);
assert.strictEqual(boundary.reasonCode, 'TARGET_MEANING_CHANGED');

boundary = normalizeTargetRetryEvaluation({
  transcript: '辣椒素会刺激与高温和灼热有关的感受器。',
  retryContext: {
    trainingNeed: 'FORMULATION_BREAKDOWN',
    retryScope: 'TARGET_EXPRESSION',
    relatedKeyPointIds: ['K2'],
    targetMaterialEvidence: '和高温、灼热刺激有关的感受器'
  },
  rawEvaluation: {
    target_retry_evaluation: {
      applicable: true,
      target_retained: true,
      target_evidence: '辣椒素会刺激与高温和灼热有关的感受器',
      meaning_changed: false,
      reason_code: 'TARGET_MEANING_RETAINED'
    }
  }
});
assert.strictEqual(boundary.targetRetained, true);

boundary = normalizeTargetRetryEvaluation({
  transcript: '所以吃辣椒会觉得辣。',
  retryContext: {
    trainingNeed: 'FORMULATION_BREAKDOWN',
    retryScope: 'TARGET_EXPRESSION',
    relatedKeyPointIds: ['K2'],
    targetMaterialEvidence: '和高温、灼热刺激有关的感受器'
  },
  rawEvaluation: {
    target_retry_evaluation: {
      applicable: true,
      target_retained: false,
      target_evidence: '所以吃辣椒会觉得辣',
      meaning_changed: false,
      reason_code: 'TARGET_DELETED'
    }
  }
});
assert.strictEqual(boundary.targetRetained, false);
assert.strictEqual(boundary.reasonCode, 'TARGET_DELETED');

// E/F. Concept and Missing retain their historical full-content invariants.
const conceptTarget = {
  detected: true,
  userEvidence: span('控制温度', '这个感受器负责控制温度。'),
  materialEvidence: { text: '高温和灼热刺激的感知', start: 0, end: 11, field: 'key_points.K2' },
  relatedKeyPointIds: ['K2']
};
const conceptFirst = expressionRound('这个感受器负责控制温度。', 'NONE', {
  coveredIds: ['K2'], taskStatus: 'CONCEPT_INACCURACY'
});
conceptFirst.taskResult.conceptInaccuracy = conceptTarget;
conceptFirst.routedResult = { primaryTrainingNeed: 'CONCEPT_INACCURACY', conceptTarget };
progress = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  originalRetryScope: 'FULL_CONTENT',
  originalConceptTarget: conceptTarget,
  firstRoundResult: conceptFirst,
  secondRoundResult: expressionRound('这个感受器负责感知高温。', 'NONE', {
    coveredIds: ['K2'], taskStatus: 'MISSING_CORE_CONTENT'
  })
});
assert.strictEqual(progress.resolved, false);

assert.strictEqual(
  routeRetellingTrainingV057(task('MISSING_CORE_CONTENT'), { processIssue: 'NONE', expressionIssue: 'NONE' })
    .retryScope,
  RETRY_SCOPES.FULL_CONTENT
);

console.log('retelling targeted retry tests passed (A-K)');
