const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { adaptDiagnosis } = require('../utils/diagnosis-service');
const { createInsightCopy } = require('../utils/insight-copy');
const questions = require('../mock/questions');

const root = path.resolve(__dirname, '..');
const recordingPage = fs.readFileSync(path.join(root, 'pages/recording/index.js'), 'utf8');
const interventionPage = fs.readFileSync(path.join(root, 'pages/intervention/index.js'), 'utf8');
const insightPage = fs.readFileSync(path.join(root, 'pages/insight/index.js'), 'utf8');
const insightView = fs.readFileSync(path.join(root, 'pages/insight/index.wxml'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'components/intervention-renderer/index.wxml'), 'utf8');
const resultPage = fs.readFileSync(path.join(root, 'pages/micro-result/index.wxml'), 'utf8');
const recordingView = fs.readFileSync(path.join(root, 'pages/recording/index.wxml'), 'utf8');

assert.ok(recordingPage.includes('analyzeRecording(runtime'));
assert.ok(recordingPage.includes("redirectTo({ url: '/pages/insight/index' })"));
assert.ok(!recordingPage.includes('/pages/processing/index'));
assert.ok(interventionPage.includes('callInterventionCheck'));
assert.ok(insightPage.includes("interventionType === 'ONE_DETAIL'"));
assert.ok(insightPage.includes('handleInlineRecorded'));
assert.ok(insightPage.includes('questionRequiredSlots'));
assert.ok(insightView.includes('inlineIntervention'));
assert.ok(renderer.includes('plan.originalQuestion'));
assert.ok(!renderer.includes('就是这句'));
assert.ok(!renderer.includes('说一句'));
assert.ok(resultPage.includes('同题再说一次'));
assert.ok(resultPage.includes('换一道题'));
assert.ok(!resultPage.includes('再来20秒'));
assert.ok(recordingView.includes('wx:if="{{ready}}"'));
assert.ok(recordingView.includes('label="开始说"'));
assert.ok(recordingView.includes('这题没什么可说的，换一道'));
assert.ok(recordingView.includes('<voice-recorder'));

const adapted = adaptDiagnosis({
  primary_issue: 'CONTENT_EXPAND',
  confidence: 0.8,
  evidence: [
    { text: '嗯，我想想', type: 'hesitation' },
    { text: '我觉得比较方便', type: 'abstract_judgment' }
  ],
  question_factor: 'NONE',
  recommended_intervention: 'ONE_DETAIL'
}, '嗯，我想想。我觉得比较方便。');
assert.strictEqual(adapted.evidenceText, '我觉得比较方便');

const lexicalAdapted = adaptDiagnosis({
  primary_issue: 'LEXICAL_RETRIEVAL',
  confidence: 0.86,
  evidence: [{ text: '那个词怎么说', type: 'explicit_lexical_search' }],
  question_factor: 'NONE',
  recommended_intervention: 'SEMANTIC_CONTRAST'
}, '他的想法特别……那个词怎么说……但我知道不是保守。');
assert.ok(lexicalAdapted.evidenceContext.includes('他的想法特别'));
assert.ok(lexicalAdapted.evidenceContext.includes('那个词怎么说'));

const complete = adaptDiagnosis({
  needs_intervention: false,
  primary_issue: null,
  confidence: 0.91,
  evidence: [{ text: '挺方便', type: 'abstract_judgment' }],
  question_factor: 'NONE',
  recommended_intervention: null
}, '电瓶车。我原来觉得很难骑，实际骑了以后发现挺方便。');
assert.strictEqual(complete.needsIntervention, false);
assert.strictEqual(complete.primaryIssue, null);
assert.strictEqual(complete.interventionType, null);
assert.deepStrictEqual(complete.evidence, []);
assert.strictEqual(complete.evidenceText, '');
const completeCopy = createInsightCopy(complete, '', {});
assert.strictEqual(completeCopy.lead, '这次说得挺完整。');
assert.strictEqual(completeCopy.cta, '换一道题');
assert.strictEqual(completeCopy.secondaryCta, '同题再说一次');

const inapplicable = adaptDiagnosis({
  question_applicable: false,
  needs_intervention: false,
  primary_issue: null,
  confidence: 0.94,
  evidence: [],
  question_factor: 'NONE',
  recommended_intervention: null
}, '最近没有，我和朋友没什么分歧。');
assert.strictEqual(inapplicable.questionApplicable, false);
const inapplicableCopy = createInsightCopy(inapplicable, '', {});
assert.strictEqual(inapplicableCopy.cta, '换一道题');
assert.ok(inapplicableCopy.lead.includes('不太适合'));

assert.strictEqual(questions[0].taskType, 'EXPERIENCE_COMPARE');
assert.deepStrictEqual(
  questions[0].requiredSlots,
  ['object', 'expectation_before', 'experience_after']
);
assert.strictEqual(questions.length, 20);
questions.forEach((question) => {
  assert.ok(question.taskType, `${question.id} missing taskType`);
  assert.ok(Array.isArray(question.requiredSlots) && question.requiredSlots.length > 0,
    `${question.id} missing requiredSlots`);
});
const distribution = questions.reduce((counts, question) => {
  counts[question.taskType] = (counts[question.taskType] || 0) + 1;
  return counts;
}, {});
assert.deepStrictEqual(distribution, {
  EXPERIENCE_COMPARE: 4,
  REASON_EXPLAIN: 4,
  OPINION_DIFFERENCE: 4,
  SIMPLE_EXPERIENCE: 4,
  CHOICE_REASON: 4
});

console.log('interaction flow tests passed');
