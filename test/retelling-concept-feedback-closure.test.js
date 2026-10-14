'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const materials = require('../data/retelling-materials');
const store = require('../utils/retelling-store');
const {
  buildGroundedReference,
  buildUnresolvedConceptFeedback
} = require('../utils/retelling-feedback-presenter');

const material = materials.find((item) => item.id === 'retelling_006');
const firstEvidence = '那么雨落下去的时候就会。把这些元素。带到空气中';
const fallbackTarget = {
  detected: true,
  userEvidence: { text: firstEvidence, start: 0, end: firstEvidence.length },
  materialEvidence: {
    text: material.coreMessage,
    start: 0,
    end: material.coreMessage.length,
    field: 'core_message'
  },
  relatedKeyPointIds: [],
  reasonCode: 'CORE_RELATION_DIRECTION_INCORRECT',
  confidence: 'HIGH'
};

const interventionReference = buildGroundedReference({
  material,
  target: fallbackTarget,
  trainingNeed: 'CONCEPT_INACCURACY'
});
assert.strictEqual(interventionReference.text, material.coreMessage);
assert.strictEqual(interventionReference.source, 'TARGET_MATERIAL_EVIDENCE');

const secondTranscript = '它没有特殊的味道。然后雨落在地上之后，把这些元素带到了空气中';
const secondMaterialEvidence = material.keyPoints.find((point) => point.id === 'K2').text;
const secondConcept = {
  detected: true,
  userEvidence: { text: secondTranscript, start: 0, end: secondTranscript.length },
  materialEvidence: {
    text: secondMaterialEvidence,
    start: 0,
    end: secondMaterialEvidence.length,
    field: 'key_points.K2.text'
  },
  relatedKeyPointIds: ['K2'],
  reasonCode: 'CONCEPT_MECHANISM_WRONG',
  confidence: 'HIGH'
};
const unresolved = buildUnresolvedConceptFeedback({
  material,
  originalTarget: fallbackTarget,
  secondRoundResult: {
    transcript: secondTranscript,
    taskResult: { conceptInaccuracy: secondConcept },
    routedResult: { primaryTrainingNeed: 'CONCEPT_INACCURACY' }
  }
});
assert.deepStrictEqual(unresolved, {
  userEvidenceText: secondTranscript,
  referenceText: '气溶胶带出气味物质',
  referenceSource: 'KEY_POINT_DISPLAY_TEXT'
});

assert.strictEqual(buildUnresolvedConceptFeedback({
  material,
  originalTarget: fallbackTarget,
  secondRoundResult: {
    transcript: '第二次原话',
    taskResult: { conceptInaccuracy: Object.assign({}, secondConcept, {
      userEvidence: { text: '模型补写、用户没说', start: 0, end: 9 }
    }) }
  }
}), null);

const template = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(template.includes('wx:if="{{conceptTarget.userEvidence.text}}"'));
assert.ok(template.includes('wx:if="{{showUnresolvedConceptFeedback}}"'));
assert.ok(template.includes('你第二次还说'));
assert.ok(template.includes('{{unresolvedConceptUserEvidence}}'));
assert.ok(template.includes('wx:if="{{showConceptIncompleteStructure}}"'));
assert.ok(template.includes('{{conceptIncompleteStructureItems}}'));
assert.ok(!template.includes('<text>“{{conceptTarget.userEvidence.text}}”</text>\n              <block'));

store.startNewSession({
  getLast() { return ''; },
  setLast() {},
  getQueue() { return ['retelling_006']; },
  setQueue() {}
}, () => 0);
store.beginFirstRecording();
store.startProcessing(1);
const firstRoundResult = {
  transcript: firstEvidence,
  taskResult: {
    taskStatus: 'INCORRECT_RELATION',
    keyPoints: [],
    relations: [],
    incorrectClaims: [{ evidence: firstEvidence, start: 0, end: firstEvidence.length }],
    conceptInaccuracy: { detected: false }
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: {
    primaryTrainingNeed: 'CONCEPT_INACCURACY',
    retryScope: 'FULL_CONTENT',
    conceptTarget: fallbackTarget,
    evidence: [{ text: firstEvidence }]
  }
};
assert.strictEqual(store.setFirstResult(firstEvidence, firstRoundResult), true);
store.beginSecondRecording();
store.startProcessing(2);
const secondRoundResult = {
  transcript: secondTranscript,
  taskResult: {
    taskStatus: 'CONCEPT_INACCURACY',
    keyPoints: [],
    relations: [],
    incorrectClaims: [],
    conceptInaccuracy: secondConcept
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: { primaryTrainingNeed: 'CONCEPT_INACCURACY' }
};
assert.strictEqual(store.setProgressResult(secondTranscript, secondRoundResult, {
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  resolved: false,
  improvementType: null,
  reasonCode: 'CONCEPT_INACCURACY_STILL_PRESENT',
  beforeEvidence: firstEvidence,
  afterEvidence: secondTranscript
}), true);

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
const pagePath = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(pagePath)];
require(pagePath);
delete global.Page;
const page = Object.assign({}, pageDefinition, {
  data: JSON.parse(JSON.stringify(pageDefinition.data)),
  pageActive: true,
  exitRequested: false,
  setData(patch) { Object.assign(this.data, patch); }
});
page.sync();
assert.strictEqual(page.data.showUnresolvedConceptFeedback, true);
assert.strictEqual(page.data.unresolvedConceptUserEvidence, secondTranscript);
assert.strictEqual(page.data.unresolvedMaterialEvidence, '气溶胶带出气味物质');
assert.strictEqual(page.data.conceptTarget.userEvidence.text, firstEvidence);

const correctedTranscript = '雨滴落到地面时，会形成微小气泡，气泡破裂以后，把土壤里的气味物质带到空气中。';
const correctedTarget = Object.assign({}, fallbackTarget, {
  userEvidence: {
    text: '会直接把土壤里的气味物质冲到空气中',
    start: 0,
    end: '会直接把土壤里的气味物质冲到空气中'.length
  },
  relatedKeyPointIds: ['K1', 'K2']
});
store.startNewSession({
  getLast() { return ''; },
  setLast() {},
  getQueue() { return ['retelling_006']; },
  setQueue() {}
}, () => 0);
store.beginFirstRecording();
store.startProcessing(1);
const correctedFirst = {
  transcript: correctedTarget.userEvidence.text,
  taskResult: {
    taskStatus: 'INCORRECT_RELATION', keyPoints: [], relations: [], incorrectClaims: [],
    conceptInaccuracy: { detected: false }
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: {
    primaryTrainingNeed: 'CONCEPT_INACCURACY', retryScope: 'FULL_CONTENT',
    conceptTarget: correctedTarget, evidence: [{ text: correctedTarget.userEvidence.text }]
  }
};
assert.strictEqual(store.setFirstResult(correctedFirst.transcript, correctedFirst), true);
store.beginSecondRecording();
store.startProcessing(2);
const correctedSecond = {
  transcript: correctedTranscript,
  taskResult: {
    taskStatus: 'MISSING_CORE_CONTENT',
    keyPoints: [], relations: [], incorrectClaims: [],
    conceptInaccuracy: { detected: false, relatedKeyPointIds: [] }
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: { primaryTrainingNeed: 'MISSING_CAUSAL_STEP' }
};
assert.strictEqual(store.setProgressResult(correctedTranscript, correctedSecond, {
  originalTrainingNeed: 'CONCEPT_INACCURACY',
  resolved: false,
  improvementType: 'CONCEPT_CORRECTED_CONTENT_INCOMPLETE',
  reasonCode: 'CONCEPT_CORRECTED_CONTENT_INCOMPLETE',
  beforeEvidence: correctedTarget.userEvidence.text,
  afterEvidence: '气泡破裂以后，把土壤里的气味物质带到空气中',
  coreMeaningClearAfter: false
}), true);
page.sync();
assert.strictEqual(page.data.resultTitle, '这里已经改对了，还差一步');
assert.strictEqual(page.data.resultExplanation,
  '刚才的原因已经说准确了，但这次还没有说到最后的结果。');
assert.strictEqual(page.data.showRetryActions, true);
assert.strictEqual(page.data.showConceptIncompleteStructure, true);
assert.deepStrictEqual(page.data.conceptIncompleteStructureItems.map((item) => item.text), [
  '气溶胶带出气味物质',
  '闻到雨后的泥土味'
]);
assert.strictEqual(page.data.showUnresolvedConceptFeedback, false);
assert.strictEqual(page.data.unresolvedMaterialEvidence, '');

console.log('retelling concept feedback closure presenter tests passed (U07 + corrected incomplete)');
