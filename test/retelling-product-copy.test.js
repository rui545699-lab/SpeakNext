'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../utils/retelling-store');

const homeTemplate = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'home', 'index.wxml'),
  'utf8'
);
assert.ok(homeTemplate.includes('信息重构'));
assert.ok(homeTemplate.includes('练习抓住重点、理清思路，把内容讲清楚。'));
assert.ok(homeTemplate.includes('label="开始练习"'));
assert.ok(homeTemplate.includes('bind:tap="startRetelling"'));
assert.ok(!homeTemplate.includes('20秒试试'));
assert.ok(!homeTemplate.includes('随便说20秒'));
assert.ok(!homeTemplate.includes('question-card'));

const hintCopy = {
  MISSING_CAUSAL_STEP: ['中间还缺一步', '再完整说一遍，把这个原因补充清楚。'],
  INCORRECT_RELATION: ['先把因果关系理清楚', '再完整说一遍。'],
  LEXICAL_RETRIEVAL: ['想不到那个词也没关系', '换一种说法继续讲。'],
  INFORMATION_ORDER: ['按事情发生的顺序重新说', '再完整说一遍。'],
  UNCERTAIN: ['再完整说一遍', '刚才还没能判断完整意思。再说一次，把原因和最后的结果连起来。']
};

Object.entries(hintCopy).forEach(([need, copy]) => {
  assert.strictEqual(store.HINT_BY_NEED[need], copy[0]);
  assert.strictEqual(store.HINT_ASSIST_BY_NEED[need], copy[1]);
});

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/retelling/index');
delete global.Page;

function dualRound(transcript, need) {
  return {
    transcript,
    taskResult: { taskStatus: need === 'PASS' ? 'PASS' : 'MISSING_CORE_CONTENT' },
    processResult: { processIssue: 'NONE' },
    routedResult: {
      primaryTrainingNeed: need,
      recommendedAction: need === 'PASS' ? 'PASS' : 'FIXTURE_ACTION',
      evidence: []
    }
  };
}

function enterResult(need, resolved) {
  store.reset();
  store.beginFirstRecording();
  store.startProcessing(1);
  const first = dualRound('第一次复述。', need);
  assert.strictEqual(store.setFirstResult(first.transcript, first), true);
  if (need !== 'PASS') {
    store.beginSecondRecording();
    store.startProcessing(2);
    const second = dualRound('第二次复述。', need);
    assert.strictEqual(store.setProgressResult(second.transcript, second, {
      originalTrainingNeed: need,
      resolved,
      improvementType: resolved ? 'FIXTURE_IMPROVEMENT' : null,
      reasonCode: resolved ? 'FIXTURE_RESOLVED' : 'FIXTURE_UNRESOLVED'
    }), true);
  }
  let rendered;
  pageDefinition.sync.call({
    setData(value) {
      rendered = value;
    }
  });
  return rendered;
}

let rendered = enterResult('PASS', true);
assert.strictEqual(rendered.resultTitle, '主要意思已说清楚');
assert.strictEqual(rendered.resultAssist, '这次主要意思已经表达清楚。不必为了说得更长继续补充。');
assert.strictEqual(rendered.showRetryActions, false);
assert.strictEqual(rendered.recordingCount, 1);
assert.strictEqual(rendered.compactResult, true);

const resolvedTitles = {
  MISSING_CAUSAL_STEP: '关键原因补上了',
  INCORRECT_RELATION: '因果关系理顺了',
  LEXICAL_RETRIEVAL: '这次没有卡在那个词上',
  INFORMATION_ORDER: '表达顺序理顺了',
  UNCERTAIN: '本轮完成'
};

const unresolvedCopy = {
  MISSING_CAUSAL_STEP: ['中间原因还缺一步', '你已经说到了结果，但中间的原因还没有补出来。'],
  INCORRECT_RELATION: ['因果关系还没理顺', '原因和结果的方向还需要重新确认。'],
  LEXICAL_RETRIEVAL: ['找词问题还没解决', '不要因为想不到一个词，就把那部分意思省略掉。'],
  INFORMATION_ORDER: ['表达顺序还没理顺', '关键信息基本都在，但先后关系还没有理顺。'],
  UNCERTAIN: ['信息还是太少', '目前的信息还不足以继续判断。']
};

Object.keys(resolvedTitles).forEach((need) => {
  rendered = enterResult(need, true);
  assert.strictEqual(rendered.resultTitle, resolvedTitles[need]);
  assert.strictEqual(rendered.showRetryActions, false);
  assert.strictEqual(rendered.recordingCount, 2);
  assert.strictEqual(rendered.compactResult, false);
  if (need === 'UNCERTAIN') {
    assert.strictEqual(rendered.resultAssist, '第二次已经说出了具体内容。');
    assert.strictEqual(rendered.showResultEyebrow, false);
  } else {
    assert.strictEqual(rendered.showResultEyebrow, true);
  }

  rendered = enterResult(need, false);
  assert.strictEqual(rendered.resultTitle, unresolvedCopy[need][0]);
  assert.strictEqual(rendered.resultExplanation, unresolvedCopy[need][1]);
  assert.strictEqual(rendered.showRetryActions, true);
  assert.strictEqual(rendered.compactResult, false);
});

rendered = enterResult('MISSING_CAUSAL_STEP', false);
const completedSession = rendered.sessionId;
const completedMaterial = rendered.material.id;
let restarted;
pageDefinition.restartTraining.call({
  sync() {
    restarted = store.getState();
  }
});
assert.strictEqual(restarted.phase, store.PHASES.READING);
assert.strictEqual(restarted.recordingCount, 0);
assert.strictEqual(restarted.material.id, completedMaterial);
assert.notStrictEqual(restarted.sessionId, completedSession);
assert.strictEqual(restarted.firstRoundResult, null);
assert.strictEqual(restarted.originalTrainingNeed, '');
assert.strictEqual(restarted.secondRoundResult, null);
assert.strictEqual(restarted.progressResult, null);
assert.strictEqual(restarted.firstTranscript, '');
assert.strictEqual(restarted.secondTranscript, '');
assert.strictEqual(store.beginFirstRecording(), true);
assert.strictEqual(store.getState().recordingCount, 1);

let relaunchedUrl = '';
global.wx = {
  reLaunch({ url }) {
    relaunchedUrl = url;
  }
};
pageDefinition.backHome();
assert.strictEqual(relaunchedUrl, '/pages/home/index');
delete global.wx;

const retellingTemplate = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(retellingTemplate.includes('label="再练一次"'));
assert.ok(retellingTemplate.includes('完成本轮'));
assert.ok(retellingTemplate.includes('retelling-state--short'));
assert.ok(retellingTemplate.includes('retelling-state--long'));
assert.ok(retellingTemplate.includes('short-state-body'));
assert.ok(retellingTemplate.includes('label="{{hintButtonText}}"'));
assert.ok(retellingTemplate.includes('读完后请用自己的话完整复述，不需要逐句背诵。'));
assert.ok(!retellingTemplate.includes('这次已经能够看清表达情况'));
assert.ok(!retellingTemplate.includes('刚才聚焦的问题已经改善'));

const retellingStyles = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxss'),
  'utf8'
);
assert.ok(retellingStyles.includes('justify-content: center'));
assert.ok(retellingStyles.includes('min-height: calc(100vh'));
assert.ok(!retellingStyles.includes('position: absolute'));

console.log('retelling product copy tests passed');
