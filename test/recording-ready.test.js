const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
global.wx = {
  getStorageSync: () => null,
  setStorageSync() {}
};

const storePath = path.join(root, 'utils/training-store.js');
delete require.cache[require.resolve(storePath)];
const store = require(storePath);
const question = require(path.join(root, 'mock/questions.js'))[0];

const initial = store.startSession(question);
assert.strictEqual(initial.recordingReady, false);

const sameQuestionPatch = store.createNextRoundPatch(question, 2);
assert.strictEqual(sameQuestionPatch.recordingReady, true);

const nextQuestion = require(path.join(root, 'mock/questions.js'))[1];
const nextQuestionPatch = store.createNextRoundPatch(nextQuestion, 2);
assert.strictEqual(nextQuestionPatch.recordingReady, true);

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
const recordingPath = path.join(root, 'pages/recording/index.js');
const diagnosisServicePath = path.join(root, 'utils/diagnosis-service.js');
let diagnosisCalls = 0;
require.cache[require.resolve(diagnosisServicePath)] = {
  id: diagnosisServicePath,
  filename: diagnosisServicePath,
  loaded: true,
  exports: {
    analyzeRecording() {
      diagnosisCalls += 1;
      throw new Error('diagnosis must not run while skipping');
    }
  }
};
delete require.cache[require.resolve(recordingPath)];
require(recordingPath);
delete global.Page;

const page = Object.assign({}, pageDefinition, {
  data: Object.assign({}, pageDefinition.data),
  setData(patch) { Object.assign(this.data, patch); }
});
store.transition('RECORDING', nextQuestionPatch);
page.onLoad();
assert.strictEqual(page.data.ready, true);
const skippedId = page.data.question.id;
page.skipQuestion();
assert.strictEqual(page.data.ready, true);
assert.notStrictEqual(page.data.question.id, skippedId);
assert.strictEqual(diagnosisCalls, 0);
page.startRecording();
assert.strictEqual(page.data.ready, false);

console.log('recording ready tests passed');
