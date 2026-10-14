const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function replaceModule(relativePath, exports) {
  const filename = require.resolve(path.join(root, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

function loadPage() {
  let definition;
  global.Page = (value) => { definition = value; };
  const filename = path.join(root, 'pages/intervention/index.js');
  delete require.cache[require.resolve(filename)];
  require(filename);
  delete global.Page;
  return definition;
}

function createPage(definition) {
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (callback) callback();
    }
  });
}

function testRecorderLimitAndTemplate() {
  let definition;
  global.Component = (value) => { definition = value; };
  const filename = path.join(root, 'components/voice-recorder/index.js');
  delete require.cache[require.resolve(filename)];
  require(filename);
  delete global.Component;
  let options;
  const context = Object.assign({}, definition.methods, {
    data: { mode: 'short', maxSeconds: 0, seconds: 0, levels: [20] },
    recorderManager: { start(value) { options = value; } },
    triggerEvent() {},
    setData(patch) { Object.assign(this.data, patch); }
  });
  const originalSetInterval = global.setInterval;
  global.setInterval = () => 1;
  try { context.start(); } finally { global.setInterval = originalSetInterval; }
  assert.strictEqual(options.duration, 30000);

  const template = fs.readFileSync(
    path.join(root, 'components/intervention-renderer/index.wxml'),
    'utf8'
  );
  assert.ok(template.includes('max-seconds="30"'));
  assert.ok(!template.includes('就是这句'));
  assert.ok(!template.includes('说一句'));
}

async function testPassContinuesWithoutTranscriptConfirmation() {
  const calls = { stored: 0, transitions: [], redirects: [], checks: 0 };
  const runtime = {
    sessionId: 'session_test',
    roundId: 'round_test',
    transcript: '因为我觉得它比较方便。',
    question: { id: 'q1', category: 'GENERAL_EXPERIENCE' },
    diagnosis: {
      primaryIssue: 'CONTENT_EXPAND',
      interventionType: 'ONE_DETAIL',
      evidence: [{ text: '比较方便', type: 'abstract_judgment' }]
    },
    sessionRound: 1
  };
  replaceModule('utils/training-store.js', {
    getRuntime: () => runtime,
    setInterventionResult: (result, options) => {
      assert.strictEqual(options.checkStatus, 'PASS');
      calls.result = result;
      calls.stored += 1;
      return true;
    },
    transition: (state) => calls.transitions.push(state),
    recordIntervention() {}
  });
  replaceModule('utils/analytics.js', { trackEvent() {} });
  replaceModule('utils/diagnosis-service.js', {
    callAsrFunction: async (fileID) => ({
      ok: true,
      stage: 'ASR',
      transcript: '想去哪儿就去哪儿，也不用走路。',
      audioFileId: fileID,
      requestId: 'asr-request'
    }),
    callInterventionCheck: async (input) => {
      calls.checks += 1;
      calls.checkInput = input;
      return {
        ok: true,
        stage: 'INTERVENTION_CHECK',
        result: 'PASS',
        intervention_pass: true,
        original_task_complete: true,
        reason: '新增了具体场景',
        requestId: 'check-request',
        modelVersion: 'deepseek-flash'
      };
    }
  });
  global.wx = {
    cloud: { uploadFile: async () => ({ fileID: 'cloud://second.mp3' }) },
    redirectTo: ({ url, success }) => {
      calls.redirects.push(url);
      if (success) success();
    }
  };
  const page = createPage(loadPage());
  page.onLoad();
  assert.strictEqual(page.data.actionState, 'RECORDING');
  await page.handleRecorded({
    detail: {
      recorded: true,
      tempFilePath: 'wxfile://second.mp3',
      durationMs: 2200,
      fileSize: 8000
    }
  });
  assert.strictEqual(calls.checks, 1);
  assert.strictEqual(calls.stored, 1);
  assert.strictEqual(calls.result.beforeText, runtime.transcript);
  assert.strictEqual(calls.result.afterText, '想去哪儿就去哪儿，也不用走路。');
  assert.strictEqual(calls.result.checkResult, 'PASS');
  assert.deepStrictEqual(calls.transitions, ['MICRO_RESULT']);
  assert.deepStrictEqual(calls.redirects, ['/pages/micro-result/index']);
}

async function testRetryStaysOnIntervention() {
  let stored = false;
  const runtime = {
    sessionId: 'session_test',
    roundId: 'round_test',
    transcript: '我觉得方便。',
    question: { id: 'q1', category: 'GENERAL_EXPERIENCE' },
    diagnosis: { primaryIssue: 'CONTENT_EXPAND', interventionType: 'ONE_DETAIL' },
    sessionRound: 1
  };
  replaceModule('utils/training-store.js', {
    getRuntime: () => runtime,
    setInterventionResult: () => { stored = true; return true; },
    transition: () => { throw new Error('must not transition'); }
  });
  replaceModule('utils/analytics.js', { trackEvent() {} });
  replaceModule('utils/diagnosis-service.js', {
    callAsrFunction: async () => ({ ok: true, stage: 'ASR', transcript: '还是方便。' }),
    callInterventionCheck: async () => ({
      ok: true,
      stage: 'INTERVENTION_CHECK',
      result: 'RETRY',
      reason: '没有新增具体内容'
    })
  });
  global.wx = {
    cloud: { uploadFile: async () => ({ fileID: 'cloud://second.mp3' }) }
  };
  const page = createPage(loadPage());
  page.onLoad();
  await page.handleRecorded({
    detail: {
      recorded: true,
      tempFilePath: 'wxfile://second.mp3',
      durationMs: 1500,
      fileSize: 4000
    }
  });
  assert.strictEqual(stored, false);
  assert.strictEqual(page.data.actionState, 'RETRY');
}

async function testNarrowScopeReturnsToOriginalQuestion() {
  let asrCalls = 0;
  let stored = 0;
  const runtime = {
    sessionId: 'session_narrow',
    roundId: 'round_narrow',
    transcript: '嗯，我想一想。',
    question: {
      id: 'q01',
      category: 'GENERAL_EXPERIENCE',
      text: '最近有没有一个东西，实际体验比你原来想象中更好？',
      taskType: 'EXPERIENCE_COMPARE',
      requiredSlots: ['object', 'expectation_before', 'experience_after']
    },
    diagnosis: {
      primaryIssue: 'CONTENT_START',
      interventionType: 'NARROW_SCOPE',
      missingRequiredSlots: ['object', 'expectation_before', 'experience_after']
    },
    sessionRound: 1
  };
  replaceModule('utils/training-store.js', {
    getRuntime: () => runtime,
    setInterventionResult: (result, options) => {
      assert.strictEqual(options.checkStatus, 'PASS');
      assert.strictEqual(result.originalTaskComplete, true);
      stored += 1;
      return true;
    },
    transition() {},
    recordIntervention() {}
  });
  replaceModule('utils/analytics.js', { trackEvent() {} });
  replaceModule('utils/diagnosis-service.js', {
    callAsrFunction: async () => {
      asrCalls += 1;
      return {
        ok: true,
        stage: 'ASR',
        transcript: asrCalls === 1
          ? '西湖醋鱼。'
          : asrCalls === 2
            ? '可以学到很多别人的经验。'
            : '广告会很多。'
      };
    },
    callInterventionCheck: async (input) => {
      if (input.phase === 'FIND_OBJECT') {
        assert.strictEqual(input.targetSlot, 'object');
        return {
          ok: true,
          stage: 'INTERVENTION_CHECK',
          result: 'PASS',
          intervention_pass: true,
          original_task_complete: false,
          missing_required_slots: ['expectation_before', 'experience_after'],
          slot_state: {
            object: { filled: true, value: '西湖醋鱼' },
            expectation_before: { filled: false, value: '' },
            experience_after: { filled: false, value: '' }
          },
          reason: '找到对象'
        };
      }
      if (input.targetSlot === 'experience_after') {
        assert.strictEqual(input.slotState.object.filled, true);
        return {
          ok: true,
          stage: 'INTERVENTION_CHECK',
          result: 'PASS',
          intervention_pass: true,
          original_task_complete: false,
          missing_required_slots: ['expectation_before'],
          slot_state: {
            object: { filled: true, value: '西湖醋鱼' },
            expectation_before: { filled: false, value: '' },
            experience_after: { filled: true, value: input.afterTranscript }
          },
          reason: '补齐实际体验'
        };
      }
      assert.strictEqual(input.targetSlot, 'expectation_before');
      assert.strictEqual(input.slotState.experience_after.filled, true);
      return {
        ok: true,
        stage: 'INTERVENTION_CHECK',
        result: 'PASS',
        intervention_pass: true,
        original_task_complete: true,
        missing_required_slots: [],
        slot_state: {
          object: { filled: true, value: '西湖醋鱼' },
          expectation_before: { filled: true, value: input.afterTranscript },
          experience_after: input.slotState.experience_after
        },
        reason: '完成原题'
      };
    }
  });
  global.wx = {
    cloud: { uploadFile: async () => ({ fileID: 'cloud://narrow.mp3' }) },
    redirectTo: () => {}
  };
  const page = createPage(loadPage());
  page.onLoad();
  assert.strictEqual(page.data.actionState, 'SELECTING');
  assert.strictEqual(page.data.plan.originalQuestion, runtime.question.text);
  page.handleAnchorSelect({ detail: { anchor: '吃过的' } });
  assert.strictEqual(page.data.plan.phase, 'FIND_OBJECT');

  const recording = {
    recorded: true,
    tempFilePath: 'wxfile://narrow.mp3',
    durationMs: 1800,
    fileSize: 5000
  };
  await page.handleRecorded({ detail: recording });
  assert.strictEqual(stored, 0);
  assert.strictEqual(page.data.plan.phase, 'ANSWER_ORIGINAL');
  assert.ok(page.data.plan.prompt.includes('西湖醋鱼'));
  assert.ok(page.data.plan.prompt.includes('比你原来想象中更好'));
  assert.strictEqual(page.data.plan.originalQuestion, runtime.question.text);
  assert.strictEqual(page.data.plan.targetSlot, 'experience_after');

  await page.handleRecorded({ detail: recording });
  assert.strictEqual(stored, 0);
  assert.strictEqual(page.data.plan.targetSlot, 'expectation_before');
  assert.strictEqual(page.data.plan.prompt, '你原来以为它会怎么样？');

  await page.handleRecorded({ detail: recording });
  assert.strictEqual(stored, 1);
}

function testStoreRequiresPassAndOriginalTaskComplete() {
  global.wx = { getStorageSync: () => null, setStorageSync() {} };
  const filename = path.join(root, 'utils/training-store.js');
  delete require.cache[require.resolve(filename)];
  const store = require(filename);

  assert.strictEqual(
    store.setInterventionResult(
      { type: 'CONTENT_EXPAND', originalTaskComplete: false },
      { checkStatus: 'PASS' }
    ),
    false
  );
  assert.strictEqual(store.getRuntime().interventionResult, null);

  assert.strictEqual(
    store.setInterventionResult(
      { type: 'CONTENT_EXPAND', originalTaskComplete: false },
      { checkStatus: 'RETRY' }
    ),
    false
  );
  assert.strictEqual(store.getRuntime().interventionResult, null);

  assert.strictEqual(
    store.setInterventionResult(
      {
        type: 'CONTENT_EXPAND',
        afterText: '一个具体场景',
        originalTaskComplete: true
      },
      { checkStatus: 'PASS' }
    ),
    true
  );
  assert.strictEqual(store.getRuntime().interventionResult.originalTaskComplete, true);
}

(async () => {
  testRecorderLimitAndTemplate();
  await testPassContinuesWithoutTranscriptConfirmation();
  await testRetryStaysOnIntervention();
  await testNarrowScopeReturnsToOriginalQuestion();
  testStoreRequiresPassAndOriginalTaskComplete();
  console.log('intervention second ASR tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
