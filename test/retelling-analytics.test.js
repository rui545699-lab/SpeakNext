'use strict';

const assert = require('assert');
const path = require('path');

const storage = new Map();
const events = [];
let rejectAnalytics = false;

global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  navigateBack() {},
  reLaunch() {},
  showToast() {},
  cloud: {
    callFunction({ name, data }) {
      assert.strictEqual(name, 'trackRetellingEvent');
      events.push(data);
      return rejectAnalytics ? Promise.reject(new Error('analytics offline')) : Promise.resolve({ result: { ok: true } });
    }
  }
};

const analytics = require('../utils/retelling-analytics');
const { validateEvent, getDocumentId } = require('../cloudfunctions/trackRetellingEvent/validation');
const store = require('../utils/retelling-store');
const trainingStore = require('../utils/training-store');
const service = require('../utils/retelling-service');

let nextNeed = 'PASS';
let nextResolved = true;
service.transcribeRetellingRecording = (recording, sessionId, round) => Promise.resolve({
  transcript: round === 1 ? '第一轮测试复述。' : '第二轮测试复述。',
  wordList: [],
  audioDuration: recording.durationMs
});
service.callRetellingEvaluation = () => Promise.resolve({
  firstRoundResult: {
    taskResult: { taskStatus: nextNeed === 'PASS' ? 'PASS' : 'MISSING_CORE_CONTENT' },
    processResult: { processIssue: 'NONE' },
    routedResult: {
      primaryTrainingNeed: nextNeed,
      recommendedAction: nextNeed === 'PASS' ? 'PASS' : 'ADD_CAUSAL_LINK',
      evidence: []
    }
  }
});
service.callRetellingProgress = (material, first, originalTrainingNeed) => Promise.resolve({
  secondRoundResult: {
    taskResult: { taskStatus: nextResolved ? 'PASS' : 'MISSING_CORE_CONTENT' },
    processResult: { processIssue: 'NONE' },
    routedResult: {
      primaryTrainingNeed: nextResolved ? 'PASS' : originalTrainingNeed,
      recommendedAction: nextResolved ? 'PASS' : 'ADD_CAUSAL_LINK',
      evidence: []
    }
  },
  progressResult: {
    originalTrainingNeed,
    resolved: nextResolved,
    improvementType: nextResolved ? 'CAUSAL_LINK_ADDED' : null,
    reasonCode: nextResolved ? 'CORE_CHAIN_COMPLETED' : 'CORE_CONTENT_STILL_MISSING'
  }
});

let definition;
global.Page = (value) => { definition = value; };
const pagePath = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(pagePath)];
require(pagePath);
delete global.Page;

function createPage() {
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); },
    selectComponent() { return null; }
  });
}

function recording() {
  return {
    detail: {
      recorded: true,
      tempFilePath: 'wxfile://recording.mp3',
      durationMs: 1600,
      fileSize: 4096
    }
  };
}

function names(fromIndex) {
  return events.slice(fromIndex).map((event) => event.eventName);
}

async function reachSecondResult(page, resolved) {
  nextNeed = 'MISSING_CAUSAL_STEP';
  nextResolved = resolved;
  page.onLoad();
  page.startFirstRecording();
  await page.handleRecordingComplete(recording());
  page.startSecondRecording();
  await page.handleRecordingComplete(recording());
}

(async () => {
  // Anonymous IDs persist locally and payload construction is a strict safe whitelist.
  const built = analytics.buildRetellingEvent({
    eventName: analytics.EVENT_NAMES.SESSION_STARTED,
    sessionId: 'session_fixture',
    materialId: 'retelling_001',
    stage: 'READING',
    transcript: 'must never be copied',
    audio: 'must never be copied',
    wordList: ['must never be copied'],
    openId: 'must never be copied'
  }, { storage: global.wx, now: () => 1000, random: () => 'fixed' });
  assert.strictEqual(built.anonymousUserId, 'anon_1000_fixed');
  assert.strictEqual(analytics.getAnonymousUserId(global.wx), built.anonymousUserId);
  assert.deepStrictEqual(Object.keys(built), [
    'eventId', 'eventVersion', 'anonymousUserId', 'sessionId', 'materialId',
    'trainingMode', 'eventName', 'stage', 'recordingRound', 'primaryTrainingNeed',
    'resolved', 'timestamp'
  ]);
  ['transcript', 'audio', 'wordList', 'openId'].forEach((key) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(built, key));
  });

  // Server validation rejects forbidden data and maps a stable eventId to one document.
  const validated = validateEvent(built);
  assert.deepStrictEqual(validated, built);
  assert.throws(() => validateEvent(Object.assign({}, built, { transcript: 'private' })), /FORBIDDEN_FIELD/);
  assert.strictEqual(getDocumentId(built.eventId), getDocumentId(built.eventId));
  assert.strictEqual(
    analytics.buildEventId('same_session', analytics.EVENT_NAMES.ROUND_COMPLETED),
    analytics.buildEventId('same_session', analytics.EVENT_NAMES.ROUND_COMPLETED)
  );

  // First-round PASS sequence and explicit completion.
  let offset = events.length;
  nextNeed = 'PASS';
  let page = createPage();
  page.onLoad();
  page.startFirstRecording();
  await page.handleRecordingComplete(recording());
  await page.finishSession();
  assert.deepStrictEqual(names(offset), [
    'RETELLING_SESSION_STARTED',
    'RETELLING_READING_COMPLETED',
    'RETELLING_FIRST_RECORDING_COMPLETED',
    'RETELLING_FIRST_EVALUATION_COMPLETED',
    'RETELLING_ROUND_COMPLETED'
  ]);

  // Intervention -> second round -> resolved -> completion.
  offset = events.length;
  page = createPage();
  await reachSecondResult(page, true);
  await page.finishSession();
  assert.deepStrictEqual(names(offset), [
    'RETELLING_SESSION_STARTED',
    'RETELLING_READING_COMPLETED',
    'RETELLING_FIRST_RECORDING_COMPLETED',
    'RETELLING_FIRST_EVALUATION_COMPLETED',
    'RETELLING_INTERVENTION_SHOWN',
    'RETELLING_SECOND_RECORDING_COMPLETED',
    'RETELLING_PROGRESS_COMPLETED',
    'RETELLING_ROUND_COMPLETED'
  ]);
  const resolvedProgress = events.find((event, index) => index >= offset
    && event.eventName === 'RETELLING_PROGRESS_COMPLETED');
  assert.strictEqual(resolvedProgress.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');
  assert.strictEqual(resolvedProgress.resolved, true);

  // Unresolved can finish the round, while retry belongs to the old session and starts a new one.
  offset = events.length;
  page = createPage();
  await reachSecondResult(page, false);
  const unresolvedSessionId = store.getState().sessionId;
  await page.finishSession();
  assert.strictEqual(names(offset).slice(-2).join(','),
    'RETELLING_PROGRESS_COMPLETED,RETELLING_ROUND_COMPLETED');

  page = createPage();
  await reachSecondResult(page, false);
  const retryOldSessionId = store.getState().sessionId;
  offset = events.length;
  page.restartTraining();
  const retryEvents = events.slice(offset);
  assert.deepStrictEqual(retryEvents.map((event) => event.eventName), [
    'RETELLING_RETRY_STARTED',
    'RETELLING_SESSION_STARTED'
  ]);
  assert.strictEqual(retryEvents[0].sessionId, retryOldSessionId);
  assert.notStrictEqual(retryEvents[1].sessionId, retryOldSessionId);
  assert.strictEqual(trainingStore.completePracticeSession(unresolvedSessionId).added, false);

  // Switching material creates a new session, but exiting never completes a round.
  page = createPage();
  offset = events.length;
  page.onLoad();
  const switchedFrom = store.getState().sessionId;
  page.switchMaterial();
  assert.deepStrictEqual(names(offset), [
    'RETELLING_SESSION_STARTED',
    'RETELLING_SESSION_STARTED'
  ]);
  assert.notStrictEqual(store.getState().sessionId, switchedFrom);
  await page.backHome();
  assert.ok(!names(offset).includes('RETELLING_ROUND_COMPLETED'));

  // Analytics failure is fail-open and does not block a valid PASS workflow/completion.
  rejectAnalytics = true;
  nextNeed = 'PASS';
  page = createPage();
  page.onLoad();
  page.startFirstRecording();
  await page.handleRecordingComplete(recording());
  const countBefore = trainingStore.getCompletedRoundCount();
  assert.strictEqual(await page.finishSession(), true);
  assert.strictEqual(trainingStore.getCompletedRoundCount(), countBefore + 1);
  rejectAnalytics = false;

  // Every emitted request has only the public analytics schema.
  const allowed = Object.keys(built).sort();
  events.forEach((event) => {
    assert.deepStrictEqual(Object.keys(event).sort(), allowed);
    ['transcript', 'audio', 'audioPath', 'base64', 'wordList', 'prompt', 'openId']
      .forEach((key) => assert.ok(!Object.prototype.hasOwnProperty.call(event, key)));
  });

  console.log('retelling analytics tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
