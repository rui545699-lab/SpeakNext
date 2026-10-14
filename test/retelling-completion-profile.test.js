'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const storage = new Map();
const navigation = [];
global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  navigateBack({ delta }) { navigation.push({ type: 'back', delta }); },
  reLaunch({ url }) { navigation.push({ type: 'relaunch', url }); },
  showToast() {}
};

const trainingStore = require('../utils/training-store');
const retellingStore = require('../utils/retelling-store');

let retellingPageDefinition;
global.Page = (definition) => { retellingPageDefinition = definition; };
const retellingPagePath = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(retellingPagePath)];
require(retellingPagePath);
delete global.Page;

function page() {
  return Object.assign({}, retellingPageDefinition, {
    data: JSON.parse(JSON.stringify(retellingPageDefinition.data)),
    pageActive: true,
    exitRequested: false,
    setData(patch) { Object.assign(this.data, patch); },
    selectComponent() { return null; }
  });
}

function round(transcript, need) {
  return {
    transcript,
    taskResult: { taskStatus: need === 'PASS' ? 'PASS' : 'MISSING_CORE_CONTENT' },
    processResult: { processIssue: 'NONE' },
    routedResult: {
      primaryTrainingNeed: need,
      recommendedAction: need === 'PASS' ? 'PASS' : 'ADD_CAUSAL_LINK',
      evidence: []
    }
  };
}

function enterResult(need, resolved) {
  retellingStore.startNewSession(undefined, () => 0);
  retellingStore.beginFirstRecording();
  retellingStore.startProcessing(1);
  const first = round('第一次复述。', need);
  assert.strictEqual(retellingStore.setFirstResult(first.transcript, first), true);
  if (need !== 'PASS') {
    retellingStore.beginSecondRecording();
    retellingStore.startProcessing(2);
    const second = round('第二次复述。', need);
    assert.strictEqual(retellingStore.setProgressResult(second.transcript, second, {
      originalTrainingNeed: need,
      resolved,
      improvementType: resolved ? 'FIXTURE_RESOLVED' : null,
      reasonCode: resolved ? 'FIXTURE_RESOLVED' : 'FIXTURE_UNRESOLVED'
    }), true);
  }
  return retellingStore.getState();
}

(async () => {
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 0);

  // First-round PASS + explicit completion = one round.
  let state = enterResult('PASS', true);
  const firstPassSessionId = state.sessionId;
  let currentPage = page();
  assert.strictEqual(await currentPage.finishSession(), true);
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 1);

  // Repeating the same completion remains idempotent.
  assert.deepStrictEqual(trainingStore.completePracticeSession(firstPassSessionId), {
    ok: true, added: false, count: 1
  });
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 1);

  // Second-round resolved + completion = one additional round.
  enterResult('MISSING_CAUSAL_STEP', true);
  currentPage = page();
  await currentPage.finishSession();
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 2);

  // Second-round unresolved + “完成本轮” also counts once.
  state = enterResult('MISSING_CAUSAL_STEP', false);
  const unresolvedSessionId = state.sessionId;
  currentPage = page();
  await Promise.all([currentPage.finishSession(), currentPage.finishSession()]);
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 3);
  assert.strictEqual(storage.get(trainingStore.COMPLETED_SESSION_IDS_KEY)
    .filter((id) => id === unresolvedSessionId).length, 1);

  // “再练一次” does not count the old session; its new session can count later.
  state = enterResult('MISSING_CAUSAL_STEP', false);
  const abandonedResultSessionId = state.sessionId;
  const retryPage = page();
  retryPage.sync = () => {};
  retryPage.restartTraining();
  state = retellingStore.getState();
  assert.notStrictEqual(state.sessionId, abandonedResultSessionId);
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 3);
  retellingStore.beginFirstRecording();
  retellingStore.startProcessing(1);
  const retryPass = round('重新练习后完成。', 'PASS');
  retellingStore.setFirstResult(retryPass.transcript, retryPass);
  currentPage = page();
  await currentPage.finishSession();
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 4);

  // Switching an unread material never counts.
  retellingStore.startNewSession(undefined, () => 0);
  retellingStore.startNewSession(undefined, () => 0);
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 4);

  // Returning in the middle of a session never counts.
  retellingStore.startNewSession(undefined, () => 0);
  retellingStore.beginFirstRecording();
  currentPage = page();
  await currentPage.backHome();
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 4);

  // Recognition/evaluation failure state cannot be completed or counted.
  retellingStore.startNewSession(undefined, () => 0);
  retellingStore.beginFirstRecording();
  retellingStore.fail(1, '识别失败');
  currentPage = page();
  assert.strictEqual(await currentPage.finishSession(), false);
  assert.strictEqual(trainingStore.getCompletedRoundCount(), 4);

  // Storage remains authoritative across a fresh module load.
  delete require.cache[require.resolve('../utils/training-store')];
  const reloadedTrainingStore = require('../utils/training-store');
  assert.strictEqual(reloadedTrainingStore.getCompletedRoundCount(), 4);
  assert.strictEqual(storage.get(reloadedTrainingStore.COMPLETED_ROUND_COUNT_KEY), 4);

  // Profile reads the persisted completion count and keeps the non-fabricated empty card.
  let profileDefinition;
  global.Page = (definition) => { profileDefinition = definition; };
  const profilePath = path.resolve(__dirname, '..', 'pages', 'profile', 'index.js');
  delete require.cache[require.resolve(profilePath)];
  require(profilePath);
  delete global.Page;
  const profileData = {};
  profileDefinition.onShow.call({ setData(patch) { Object.assign(profileData, patch); } });
  assert.strictEqual(profileData.totalRounds, 4);
  assert.strictEqual(profileData.sessionCount, 4);

  const profileTemplate = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages', 'profile', 'index.wxml'),
    'utf8'
  );
  assert.ok(profileTemplate.includes('已经完成 {{totalRounds}} 轮练习'));
  assert.ok(profileTemplate.includes('我还在认识你的表达习惯。'));
  assert.ok(!profileTemplate.includes('最近7次中出现3次'));

  const retellingTemplate = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
    'utf8'
  );
  assert.ok(retellingTemplate.includes('label="完成" bind:tap="finishSession"'));
  assert.ok(retellingTemplate.includes('bindtap="finishSession">完成本轮'));

  console.log('retelling completion/profile tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
