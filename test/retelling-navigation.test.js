'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../utils/retelling-store');
const service = require('../utils/retelling-service');

const storage = new Map();
const relaunched = [];
const navigatedBack = [];
global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  navigateBack({ delta }) { navigatedBack.push(delta); },
  reLaunch({ url }) { relaunched.push(url); }
};

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
const pageFile = path.resolve(__dirname, '..', 'pages', 'retelling', 'index.js');
delete require.cache[require.resolve(pageFile)];
require(pageFile);
delete global.Page;

function createPage(overrides = {}) {
  return Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    destroyed: false,
    postUnloadSetData: 0,
    setData(patch) {
      if (this.destroyed) {
        this.postUnloadSetData += 1;
        return;
      }
      Object.assign(this.data, patch);
    },
    selectComponent() { return null; }
  }, overrides);
}

const template = fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'),
  'utf8'
);
assert.ok(template.includes('action="back"'));
assert.ok(template.includes('bind:back="backHome"'));
assert.ok(template.includes('bindtap="switchMaterial">换一篇'));
const readingEnd = template.indexOf('</block>', template.indexOf("phase == 'READING'"));
assert.ok(template.indexOf('bindtap="switchMaterial"') < readingEnd,
  'switch action must only be rendered inside READING');

const readingPage = createPage();
readingPage.onLoad();
const firstMaterialId = readingPage.data.materialId;
const firstSessionId = readingPage.data.sessionId;
readingPage.switchMaterial();
assert.notStrictEqual(readingPage.data.materialId, firstMaterialId);
assert.notStrictEqual(readingPage.data.sessionId, firstSessionId);
assert.strictEqual(readingPage.data.phase, store.PHASES.READING);
assert.strictEqual(readingPage.data.recordingCount, 0);
assert.strictEqual(readingPage.data.firstTranscript, '');
assert.strictEqual(readingPage.data.firstRoundResult, null);
assert.strictEqual(readingPage.data.originalTrainingNeed, '');
assert.strictEqual(readingPage.data.originalConceptTarget, null);
assert.strictEqual(readingPage.data.originalExpressionTarget, null);
assert.strictEqual(readingPage.data.secondTranscript, '');
assert.strictEqual(readingPage.data.secondRoundResult, null);
assert.strictEqual(readingPage.data.progressResult, null);

readingPage.startFirstRecording();
const recordingMaterialId = readingPage.data.materialId;
readingPage.switchMaterial();
assert.strictEqual(store.getState().materialId, recordingMaterialId,
  'switching is ignored after recording starts');

(async () => {
  let releaseRecorder;
  const recorderStop = new Promise((resolve) => { releaseRecorder = resolve; });
  const recordingPage = createPage({
    selectComponent() {
      return { stopForExit: () => recorderStop };
    }
  });
  recordingPage.onLoad();
  recordingPage.startFirstRecording();
  const backPromise = recordingPage.backHome();
  assert.ok(!relaunched.length, 'navigation must wait for recorder release');
  releaseRecorder();
  await backPromise;
  assert.strictEqual(navigatedBack.pop(), 1);
  assert.strictEqual(relaunched.length, 0);

  const originalTranscribe = service.transcribeRetellingRecording;
  const originalEvaluate = service.callRetellingEvaluation;
  let resolveAsr;
  let evaluationCalls = 0;
  service.transcribeRetellingRecording = () => new Promise((resolve) => { resolveAsr = resolve; });
  service.callRetellingEvaluation = () => {
    evaluationCalls += 1;
    return Promise.resolve({});
  };

  const asyncPage = createPage();
  asyncPage.onLoad();
  asyncPage.startFirstRecording();
  const pending = asyncPage.handleRecordingComplete({ detail: {
    recorded: true,
    tempFilePath: 'wxfile://retelling-navigation.mp3',
    durationMs: 1800,
    fileSize: 5000
  } });
  asyncPage.destroyed = true;
  asyncPage.onUnload();
  resolveAsr({ transcript: '迟到的识别结果。' });
  await pending;
  assert.strictEqual(asyncPage.postUnloadSetData, 0);
  assert.strictEqual(evaluationCalls, 0,
    'an unloaded page must not continue into evaluation');

  service.transcribeRetellingRecording = originalTranscribe;
  service.callRetellingEvaluation = originalEvaluate;
  console.log('retelling navigation tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
