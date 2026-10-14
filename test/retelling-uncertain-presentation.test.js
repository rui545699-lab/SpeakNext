'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../utils/retelling-store');
const {
  UNCERTAIN_VARIANTS,
  buildUncertainPresentation
} = require('../utils/retelling-feedback-presenter');

function uncertainRound(overrides = {}) {
  const taskResult = Object.assign({
    taskStatus: 'UNCERTAIN',
    coreMeaningClear: false,
    coreFactsComplete: true,
    missingCorePointIds: [],
    requiresNewContent: false,
    keyPoints: [
      { id: 'K2', covered: true, evidence: '气味无法到达嗅觉系统' },
      { id: 'K3', covered: true, evidence: '舌头能正常品尝酸甜苦辣咸' },
      { id: 'K4', covered: true, evidence: '味道少了几分' }
    ],
    relations: [{
      id: 'R2',
      status: 'UNSUPPORTED',
      fromEvidence: '气味无法到达嗅觉系统',
      toEvidence: '味道少了几分',
      relationEvidence: ''
    }],
    incorrectClaims: [],
    conceptInaccuracy: { detected: false }
  }, overrides.taskResult || {});
  return {
    transcript: overrides.transcript || '因为捏住鼻子的时候，食物的味道就无法到达鼻腔后面的嗅觉系统。舌头能正常品尝酸甜苦辣咸，但是味道就少了几分。',
    taskResult,
    processResult: overrides.processResult || {
      processIssue: 'NONE',
      expressionIssue: 'NONE'
    },
    routedResult: {
      primaryTrainingNeed: 'UNCERTAIN',
      recommendedAction: 'OBSERVE_AGAIN',
      evidence: []
    }
  };
}

const relationRound = uncertainRound();
const relationPresentation = buildUncertainPresentation({ firstRoundResult: relationRound });
assert.deepStrictEqual(relationPresentation, {
  uncertainVariant: UNCERTAIN_VARIANTS.RELATION_UNCLEAR,
  eyebrow: '只调整一个地方',
  title: '把原因和结果连起来',
  description: '关键内容已经有了。再说一遍，重点说明它们之间的关系。',
  buttonText: '重新说一次'
});
assert.strictEqual(relationRound.routedResult.primaryTrainingNeed, 'UNCERTAIN');

const generalRound = uncertainRound({
  transcript: '嗯……我没太看懂。',
  taskResult: {
    taskStatus: 'UNCERTAIN',
    coreMeaningClear: false,
    coreFactsComplete: false,
    missingCorePointIds: ['K2', 'K3'],
    requiresNewContent: false,
    keyPoints: [],
    relations: [{ id: 'R2', status: 'UNSUPPORTED' }],
    incorrectClaims: [],
    conceptInaccuracy: { detected: false }
  }
});
const generalPresentation = buildUncertainPresentation({ firstRoundResult: generalRound });
assert.deepStrictEqual(generalPresentation, {
  uncertainVariant: UNCERTAIN_VARIANTS.GENERAL,
  eyebrow: '再确认一次',
  title: '再完整说一遍',
  description: '刚才还没能判断完整意思。再说一次，把原因和最后的结果连起来。',
  buttonText: '重新说一次'
});
assert.notStrictEqual(generalPresentation.title, relationPresentation.title);

// V0.5.9B audit fixture: grounded word-search breakdown currently remains routed
// to UNCERTAIN. This test records that priority without changing Router behavior.
const formulationRound = uncertainRound({
  transcript: '辣椒素会刺激一个叫什么来着，反正就是一种感受器，所以会觉得辣。',
  taskResult: {
    taskStatus: 'UNCERTAIN',
    coreFactsComplete: false,
    missingCorePointIds: ['K2'],
    relations: [{ id: 'R2', status: 'UNSUPPORTED' }],
    incorrectClaims: [],
    conceptInaccuracy: { detected: false }
  },
  processResult: {
    processIssue: 'FORMULATION_BREAKDOWN',
    expressionIssue: 'FORMULATION_BREAKDOWN',
    reasonCode: 'WORD_SEARCH_INTERRUPTION',
    userEvidence: { text: '叫什么来着' }
  }
});
assert.strictEqual(formulationRound.routedResult.primaryTrainingNeed, 'UNCERTAIN');
assert.strictEqual(
  buildUncertainPresentation({ firstRoundResult: formulationRound }).uncertainVariant,
  UNCERTAIN_VARIANTS.GENERAL
);

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
const pagePath = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(pagePath)];
require(pagePath);
delete global.Page;

function renderHint(round) {
  store.reset();
  assert.strictEqual(store.beginFirstRecording(), true);
  assert.strictEqual(store.startProcessing(1), true);
  assert.strictEqual(store.setFirstResult(round.transcript, round), true);
  const page = Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    pageActive: true,
    exitRequested: false,
    setData(patch) { Object.assign(this.data, patch); }
  });
  page.sync();
  return page.data;
}

let rendered = renderHint(relationRound);
assert.strictEqual(rendered.uncertainVariant, 'RELATION_UNCLEAR');
assert.strictEqual(rendered.hintTitle, '把原因和结果连起来');
assert.ok(rendered.hintDescription.includes('关键内容已经有了'));
assert.strictEqual(rendered.hintButtonText, '重新说一次');
assert.strictEqual(rendered.originalTrainingNeed, 'UNCERTAIN');
assert.strictEqual(rendered.firstRoundResult.routedResult.primaryTrainingNeed, 'UNCERTAIN');
assert.ok(!rendered.hintTitle.includes('先说出你最确定的一点'));
assert.ok(!rendered.hintDescription.includes('不用一次说完整'));

rendered = renderHint(generalRound);
assert.strictEqual(rendered.uncertainVariant, 'GENERAL');
assert.strictEqual(rendered.hintEyebrow, '再确认一次');
assert.strictEqual(rendered.hintTitle, '再完整说一遍');
assert.strictEqual(rendered.hintDescription,
  '刚才还没能判断完整意思。再说一次，把原因和最后的结果连起来。');
assert.ok(!rendered.hintTitle.includes('把原因和结果连起来'));
assert.strictEqual(rendered.firstRoundResult.routedResult.primaryTrainingNeed, 'UNCERTAIN');

// Becoming evaluable with a concrete Missing issue is not a successful result.
store.startNewSession({
  getLast() { return ''; },
  setLast() {},
  getQueue() { return ['retelling_006']; },
  setQueue() {}
}, () => 0);
assert.strictEqual(store.beginFirstRecording(), true);
assert.strictEqual(store.startProcessing(1), true);
const clarifiedButMissingFirst = uncertainRound({
  transcript: '土地中有特殊气味的东西，雨滴落地后把它们裹挟到空气中，进入气溶胶，再进入鼻腔。',
  taskResult: {
    taskStatus: 'UNCERTAIN',
    coreMeaningClear: false,
    coreFactsComplete: false,
    missingCorePointIds: ['K2', 'K3'],
    keyPoints: [],
    relations: [{ id: 'R2', status: 'UNSUPPORTED' }],
    incorrectClaims: [],
    conceptInaccuracy: { detected: false }
  }
});
assert.strictEqual(store.setFirstResult(clarifiedButMissingFirst.transcript, clarifiedButMissingFirst), true);
assert.strictEqual(store.beginSecondRecording(), true);
assert.strictEqual(store.startProcessing(2), true);
const clarifiedButMissingSecondTranscript = '土壤里有特殊气味的物质，它们随着气溶胶进入鼻腔，所以会闻到土味。';
const k3Evidence = '它们随着气溶胶进入鼻腔，所以会闻到土味';
const k3Start = clarifiedButMissingSecondTranscript.indexOf(k3Evidence);
const clarifiedButMissingSecond = {
  transcript: clarifiedButMissingSecondTranscript,
  taskResult: {
    taskStatus: 'MISSING_CORE_CONTENT',
    coreMeaningClear: false,
    coreFactsComplete: false,
    missingCorePointIds: ['K2'],
    keyPoints: [
      { id: 'K2', covered: false, evidence: '', start: -1, end: -1 },
      { id: 'K3', covered: true, evidence: k3Evidence, start: k3Start, end: k3Start + k3Evidence.length }
    ],
    relations: [{ id: 'R2', status: 'MISSING' }],
    incorrectClaims: []
  },
  processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
  routedResult: {
    primaryTrainingNeed: 'MISSING_CAUSAL_STEP',
    recommendedAction: 'ADD_CAUSAL_LINK',
    evidence: []
  }
};
assert.strictEqual(store.setProgressResult(clarifiedButMissingSecondTranscript, clarifiedButMissingSecond, {
  originalTrainingNeed: 'UNCERTAIN',
  originalRetryScope: 'FULL_CONTENT',
  resolved: false,
  improvementType: 'EVIDENCE_CLARIFIED',
  reasonCode: 'UNCERTAIN_CLARIFIED_ISSUE_REMAINS',
  coreMeaningClearAfter: false
}), true);
const clarifiedButMissingPage = Object.assign({}, pageDefinition, {
  data: JSON.parse(JSON.stringify(pageDefinition.data)),
  pageActive: true,
  exitRequested: false,
  setData(patch) { Object.assign(this.data, patch); }
});
clarifiedButMissingPage.sync();
assert.strictEqual(clarifiedButMissingPage.data.resultTitle, '现在更清楚了，还差一步');
assert.strictEqual(clarifiedButMissingPage.data.resultExplanation,
  '第二次已经能看出你想表达的意思，但还有一个关键内容没有说完整。');
assert.strictEqual(clarifiedButMissingPage.data.showRetryActions, true);
assert.strictEqual(clarifiedButMissingPage.data.showMissingStructure, true);
assert.strictEqual(clarifiedButMissingPage.data.resultStructureLabel, '还缺的关键意思');
assert.strictEqual(clarifiedButMissingPage.data.showResultEyebrow, false);
assert.notStrictEqual(clarifiedButMissingPage.data.resultTitle, '本轮完成');
assert.notStrictEqual(clarifiedButMissingPage.data.resultAssist, '第二次已经说出了具体内容。');
assert.ok(clarifiedButMissingPage.data.missingStructureItems.length >= 3);

const template = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(template.includes('{{hintEyebrow}}'));
assert.ok(template.includes('{{hintTitle}}'));
assert.ok(template.includes('{{hintDescription}}'));
assert.ok(template.includes('label="{{hintButtonText}}"'));
assert.ok(!template.includes('先说出你最确定的一点'));
assert.ok(!template.includes('不用一次说完整'));

console.log('retelling UNCERTAIN presentation tests passed');
