'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const { composeRetellingV057Evaluation } = require('../lib/retelling-dual-evaluator');
const { resolveRetellingProgress } = require('../lib/retelling-progress-resolver');
const { buildFirstRoundDebugSummary } = require('../lib/eval-debug-summary');

const material = materialPayload(materials.find((item) => item.id === 'retelling_006'));
const firstTranscript = '呃，刚下小雨时，空气里的土味，呃，是因为。呃，土壤里面有很多。特殊味道的元素。那么雨落下去的时候就会。把这些元素。带到空气中。呃，然后被人闻到。';
const firstEvidence = '那么雨落下去的时候就会。把这些元素。带到空气中';
const firstStart = firstTranscript.indexOf(firstEvidence);
const firstTask = {
  taskStatus: 'INCORRECT_RELATION',
  coreMeaningClear: false,
  coreFactsComplete: false,
  missingCorePointIds: ['K2'],
  requiresNewContent: false,
  keyPoints: [],
  relations: material.relations.map((relation) => ({
    id: relation.id,
    status: 'MISSING',
    fromEvidence: '',
    toEvidence: '',
    relationEvidence: '',
    fromSpan: null,
    toSpan: null,
    relationSpan: null
  })),
  incorrectClaims: [{
    claim: '雨滴直接把土壤中的气味元素带到空气中，缺少气泡破裂释放气溶胶的机制',
    evidence: firstEvidence,
    start: firstStart,
    end: firstStart + firstEvidence.length
  }],
  conceptInaccuracy: {
    detected: false,
    userEvidence: null,
    materialEvidence: null,
    relatedKeyPointIds: [],
    reasonCode: 'CONCEPT_NONE',
    confidence: 'LOW'
  }
};

const firstRoundResult = Object.assign({ transcript: firstTranscript }, composeRetellingV057Evaluation({
  material,
  transcript: firstTranscript
}, firstTask, { expression_diagnosis: { issue: 'NONE' } }));

assert.strictEqual(firstRoundResult.routedResult.ruleId, 'ROUTE_CONTENT_RELATION_AS_CONCEPT');
assert.strictEqual(firstRoundResult.routedResult.primaryTrainingNeed, 'CONCEPT_INACCURACY');
assert.strictEqual(firstRoundResult.routedResult.retryScope, 'FULL_CONTENT');
assert.strictEqual(firstRoundResult.routedResult.conceptTarget.detected, true);
assert.strictEqual(firstRoundResult.routedResult.conceptTarget.userEvidence.text, firstEvidence);
assert.strictEqual(firstRoundResult.routedResult.conceptTarget.userEvidence.start, firstStart);
assert.ok(firstRoundResult.routedResult.conceptTarget.materialEvidence.text);
assert.deepStrictEqual(firstRoundResult.routedResult.conceptTarget.relatedKeyPointIds, []);
assert.strictEqual(firstRoundResult.routedResult.evidence[0].text, firstEvidence);
assert.notStrictEqual(firstRoundResult.routedResult.conceptTarget.userEvidence.text,
  firstTask.incorrectClaims[0].claim);

const summary = buildFirstRoundDebugSummary({
  material,
  transcript: firstTranscript,
  evaluation: firstRoundResult
});
assert.strictEqual(summary.routedConceptUserEvidence, firstEvidence);
assert.strictEqual(summary.routedConceptMaterialEvidence, material.core_message);
assert.deepStrictEqual(summary.routedConceptRelatedKeyPointIds, []);

const secondTranscript = '它没有特殊的味道。然后雨落在地上之后，把这些元素带到了空气中';
const secondEvidence = secondTranscript;
const secondMaterialEvidence = material.key_points.find((point) => point.id === 'K2').text;
const secondRoundResult = {
  transcript: secondTranscript,
  taskResult: {
    taskStatus: 'CONCEPT_INACCURACY',
    keyPoints: [],
    relations: [],
    incorrectClaims: [],
    conceptInaccuracy: {
      detected: true,
      userEvidence: { text: secondEvidence, start: 0, end: secondEvidence.length },
      materialEvidence: {
        text: secondMaterialEvidence,
        start: 0,
        end: secondMaterialEvidence.length,
        field: 'key_points.K2.text'
      },
      relatedKeyPointIds: ['K2'],
      reasonCode: 'CONCEPT_MECHANISM_WRONG',
      confidence: 'HIGH'
    }
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: { primaryTrainingNeed: 'CONCEPT_INACCURACY' }
};

const progress = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  originalRetryScope: 'FULL_CONTENT',
  originalConceptTarget: firstRoundResult.routedResult.conceptTarget,
  firstRoundResult,
  secondRoundResult
});
assert.strictEqual(progress.resolved, false);
assert.strictEqual(progress.reasonCode, 'CONCEPT_INACCURACY_STILL_PRESENT');
assert.notStrictEqual(progress.reasonCode, 'TARGET_CONTENT_REMOVED');
assert.strictEqual(progress.beforeEvidence, firstEvidence);
assert.strictEqual(progress.afterEvidence, secondEvidence);

const correctedTranscript = '雨滴落到地面时，会形成微小气泡，气泡破裂以后，把土壤里的气味物质带到空气中。';
const correctedK1 = '雨滴落到地面时，会形成微小气泡';
const correctedK2 = '气泡破裂以后，把土壤里的气味物质带到空气中';
const correctedRelation = '雨滴落到地面时，会形成微小气泡，气泡破裂以后，把土壤里的气味物质带到空气中';
const span = (text) => ({
  text,
  start: correctedTranscript.indexOf(text),
  end: correctedTranscript.indexOf(text) + text.length
});
const originalCorrectionTranscript = '雨落下来，会直接把土壤里的气味物质冲到空气中';
const originalCorrectionEvidence = '会直接把土壤里的气味物质冲到空气中';
const relationBoundTarget = Object.assign({}, firstRoundResult.routedResult.conceptTarget, {
  userEvidence: {
    text: originalCorrectionEvidence,
    start: originalCorrectionTranscript.indexOf(originalCorrectionEvidence),
    end: originalCorrectionTranscript.indexOf(originalCorrectionEvidence)
      + originalCorrectionEvidence.length
  },
  relatedKeyPointIds: ['K1', 'K2']
});
const relationBoundFirst = Object.assign({}, firstRoundResult, {
  transcript: originalCorrectionTranscript,
  taskResult: Object.assign({}, firstRoundResult.taskResult, {
    relations: [{
      id: 'R1',
      status: 'INCORRECT',
      fromEvidence: '雨落下来',
      toEvidence: originalCorrectionEvidence,
      relationEvidence: originalCorrectionTranscript,
      fromSpan: { text: '雨落下来', start: 0, end: 4 },
      toSpan: relationBoundTarget.userEvidence,
      relationSpan: { text: originalCorrectionTranscript, start: 0, end: originalCorrectionTranscript.length }
    }]
  }),
  routedResult: Object.assign({}, firstRoundResult.routedResult, {
    conceptTarget: relationBoundTarget
  })
});
const correctedIncompleteRound = {
  transcript: correctedTranscript,
  taskResult: {
    taskStatus: 'MISSING_CORE_CONTENT',
    coreMeaningClear: false,
    coreFactsComplete: false,
    missingCorePointIds: ['K3'],
    requiresNewContent: true,
    keyPoints: [
      Object.assign({ id: 'K1', covered: true, evidence: correctedK1 }, span(correctedK1)),
      Object.assign({ id: 'K2', covered: true, evidence: correctedK2 }, span(correctedK2)),
      { id: 'K3', covered: false, evidence: '', start: -1, end: -1 }
    ],
    relations: [{
      id: 'R1',
      status: 'CORRECT',
      fromEvidence: correctedK1,
      toEvidence: correctedK2,
      relationEvidence: correctedRelation,
      fromSpan: span(correctedK1),
      toSpan: span(correctedK2),
      relationSpan: span(correctedRelation)
    }, {
      id: 'R2', status: 'MISSING', fromEvidence: '', toEvidence: '', relationEvidence: '',
      fromSpan: null, toSpan: null, relationSpan: null
    }],
    incorrectClaims: [],
    conceptInaccuracy: {
      detected: false,
      userEvidence: null,
      materialEvidence: null,
      relatedKeyPointIds: [],
      reasonCode: 'CONCEPT_NONE',
      confidence: 'LOW'
    }
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: { primaryTrainingNeed: 'MISSING_CAUSAL_STEP' }
};

const correctedIncomplete = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  originalRetryScope: 'FULL_CONTENT',
  originalConceptTarget: relationBoundTarget,
  firstRoundResult: relationBoundFirst,
  secondRoundResult: correctedIncompleteRound
});
assert.strictEqual(correctedIncomplete.resolved, false);
assert.strictEqual(correctedIncomplete.reasonCode, 'CONCEPT_CORRECTED_CONTENT_INCOMPLETE');
assert.strictEqual(correctedIncomplete.improvementType, null);
assert.notStrictEqual(correctedIncomplete.reasonCode, 'CONCEPT_INACCURACY_STILL_PRESENT');
assert.notStrictEqual(correctedIncomplete.reasonCode, 'TARGET_CONTENT_REMOVED');
assert.strictEqual(correctedIncomplete.afterEvidence, correctedRelation);
assert.strictEqual(correctedIncomplete.coreMeaningClearAfter, false);

const completedTranscript = `${correctedRelation}，所以人会闻到雨后的泥土味。`;
const completedK3 = '所以人会闻到雨后的泥土味';
const completeRound = JSON.parse(JSON.stringify(correctedIncompleteRound));
completeRound.transcript = completedTranscript;
completeRound.taskResult.taskStatus = 'PASS';
completeRound.taskResult.coreMeaningClear = true;
completeRound.taskResult.coreFactsComplete = true;
completeRound.taskResult.missingCorePointIds = [];
completeRound.taskResult.requiresNewContent = false;
completeRound.taskResult.keyPoints[2] = {
  id: 'K3', covered: true, evidence: completedK3,
  start: completedTranscript.indexOf(completedK3),
  end: completedTranscript.indexOf(completedK3) + completedK3.length
};
const completeR2 = `${correctedK2}，${completedK3}`;
const completedSpan = (text) => ({
  text,
  start: completedTranscript.indexOf(text),
  end: completedTranscript.indexOf(text) + text.length
});
completeRound.taskResult.relations[1] = {
  id: 'R2',
  status: 'CORRECT',
  fromEvidence: correctedK2,
  toEvidence: completedK3,
  relationEvidence: completeR2,
  fromSpan: completedSpan(correctedK2),
  toSpan: completedSpan(completedK3),
  relationSpan: completedSpan(completeR2)
};
const complete = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  originalRetryScope: 'FULL_CONTENT',
  originalConceptTarget: relationBoundTarget,
  firstRoundResult: relationBoundFirst,
  secondRoundResult: completeRound
});
assert.strictEqual(complete.resolved, true);
assert.strictEqual(complete.reasonCode, 'CONCEPT_CORRECTED');

console.log('retelling concept feedback closure cloud tests passed (still wrong / corrected complete / corrected incomplete)');
