'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const materials = require('../data/retelling-materials');
const {
  STORAGE_KEY,
  QUEUE_STORAGE_KEY,
  selectNextMaterial
} = require('../utils/retelling-material-selector');
const store = require('../utils/retelling-store');

function storage(initial = {}) {
  let last = initial.last || '';
  let queue = initial.queue === undefined ? [] : initial.queue;
  return {
    getLast() { return last; },
    setLast(value) { last = value; },
    getQueue() { return Array.isArray(queue) ? queue.slice() : queue; },
    setQueue(value) { queue = value.slice(); },
    snapshot() { return { last, queue: Array.isArray(queue) ? queue.slice() : queue }; }
  };
}

// 1. The injectable random source changes the initial shuffled selection.
const initialA = selectNextMaterial(materials, storage(), () => 0).id;
const initialB = selectNextMaterial(materials, storage(), () => 0.999999).id;
assert.notStrictEqual(initialA, initialB);

// 2-4. Six unique consumes, automatic seventh-cycle creation, no boundary repeat.
const cycleStorage = storage();
const sequence = [];
for (let index = 0; index < 7; index += 1) {
  sequence.push(selectNextMaterial(materials, cycleStorage, () => 0).id);
}
assert.strictEqual(new Set(sequence.slice(0, 6)).size, 6);
assert.ok(sequence[6]);
assert.notStrictEqual(sequence[6], sequence[5]);

// 5-6. Switching uses the next bag item and creates a completely clean session.
const sessionStorage = storage();
let state = store.startNewSession(sessionStorage, () => 0);
const firstMaterialId = state.materialId;
const firstSessionId = state.sessionId;
assert.strictEqual(store.beginFirstRecording(), true);
assert.strictEqual(store.startProcessing(1), true);
const firstResult = {
  taskResult: { taskStatus: 'PASS' },
  processResult: { processIssue: 'NONE' },
  routedResult: { primaryTrainingNeed: 'PASS', recommendedAction: 'PASS', evidence: [] }
};
assert.strictEqual(store.setFirstResult('旧材料的复述。', firstResult), true);
state = store.startNewSession(sessionStorage, () => 0);
assert.notStrictEqual(state.materialId, firstMaterialId);
assert.notStrictEqual(state.sessionId, firstSessionId);
assert.strictEqual(state.phase, store.PHASES.READING);
assert.strictEqual(state.recordingCount, 0);
assert.strictEqual(state.firstTranscript, '');
assert.strictEqual(state.firstRoundResult, null);
assert.strictEqual(state.secondTranscript, '');
assert.strictEqual(state.secondRoundResult, null);
assert.strictEqual(state.originalTrainingNeed, '');
assert.strictEqual(state.originalConceptTarget, null);
assert.strictEqual(state.originalExpressionTarget, null);
assert.strictEqual(state.progressResult, null);

// 7. Moving through first/second recording never consumes another queue item.
const beforeRounds = sessionStorage.snapshot();
assert.strictEqual(store.beginFirstRecording(), true);
assert.strictEqual(store.startProcessing(1), true);
const trainingResult = {
  taskResult: { taskStatus: 'MISSING_CORE_CONTENT' },
  processResult: { processIssue: 'NONE' },
  routedResult: {
    primaryTrainingNeed: 'MISSING_CAUSAL_STEP',
    recommendedAction: 'ADD_CAUSAL_LINK',
    evidence: []
  }
};
assert.strictEqual(store.setFirstResult('第一次。', trainingResult), true);
assert.strictEqual(store.beginSecondRecording(), true);
assert.strictEqual(store.startProcessing(2), true);
assert.deepStrictEqual(sessionStorage.snapshot(), beforeRounds);

// 8. Retry creates a new session for the same material without consuming the bag.
const retryMaterialId = store.getState().materialId;
const retryQueue = sessionStorage.snapshot();
const retrySessionId = store.getState().sessionId;
state = store.restartCurrentMaterial();
assert.strictEqual(state.materialId, retryMaterialId);
assert.notStrictEqual(state.sessionId, retrySessionId);
assert.strictEqual(state.recordingCount, 0);
assert.deepStrictEqual(sessionStorage.snapshot(), retryQueue);

// 9. Leaving and entering again consumes the remaining persisted queue.
const remainingBeforeReentry = sessionStorage.snapshot().queue;
state = store.startNewSession(sessionStorage, () => 0);
assert.strictEqual(state.materialId, remainingBeforeReentry[0]);
assert.deepStrictEqual(sessionStorage.snapshot().queue, remainingBeforeReentry.slice(1));

// 10. Malformed and stale queues recover without invalid or immediate-repeat IDs.
const malformed = storage({ last: 'retelling_002', queue: '{bad json' });
assert.notStrictEqual(selectNextMaterial(materials, malformed, () => 0).id, 'retelling_002');
const stale = storage({
  last: 'retelling_002',
  queue: ['unknown', 'retelling_002', 'retelling_003', 'retelling_003']
});
assert.strictEqual(selectNextMaterial(materials, stale, () => 0).id, 'retelling_003');
assert.deepStrictEqual(stale.snapshot().queue, []);

assert.strictEqual(STORAGE_KEY, 'speaknext_retelling_last_material_id');
assert.strictEqual(QUEUE_STORAGE_KEY, 'speaknext_retelling_material_queue');

const template = fs.readFileSync(path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxml'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '..', 'pages', 'retelling', 'index.wxss'), 'utf8');
assert.ok(template.includes('action="back"'));
assert.ok(template.includes('bindtap="switchMaterial">换一篇'));
assert.ok(styles.includes('.retelling__switch'));
assert.ok(styles.includes('color: #85857f'));
assert.ok(styles.includes('font-size: 25rpx'));

console.log('retelling practice navigation tests passed (10 cases)');
