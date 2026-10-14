const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');

function replaceModule(relativePath, exports) {
  const filename = require.resolve(path.join(root, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

function loadPage() {
  let definition;
  global.Page = (value) => { definition = value; };
  const filename = path.join(root, 'pages/insight/index.js');
  delete require.cache[require.resolve(filename)];
  require(filename);
  delete global.Page;
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data),
    setData(patch) { Object.assign(this.data, patch); }
  });
}

(async () => {
  const runtime = {
    state: 'INSIGHT',
    sessionId: 'session_q01',
    roundId: 'round_q01',
    sessionRound: 1,
    transcript: '电瓶车吧，感觉挺好的。',
    signals: {},
    question: {
      id: 'q01',
      text: '最近有没有一个东西，实际体验比你原来想象中更好？',
      category: 'GENERAL_EXPERIENCE',
      taskType: 'EXPERIENCE_COMPARE',
      requiredSlots: ['object', 'expectation_before', 'experience_after']
    },
    diagnosis: {
      needsIntervention: true,
      primaryIssue: 'CONTENT_EXPAND',
      interventionType: 'ONE_DETAIL',
      evidence: [{ text: '感觉挺好的', type: 'abstract_judgment' }],
      evidenceText: '感觉挺好的',
      missingRequiredSlots: ['expectation_before']
    }
  };
  const calls = { transitions: [], checks: [], stored: 0, redirects: [] };
  replaceModule('utils/training-store.js', {
    getRuntime: () => runtime,
    transition: (state) => calls.transitions.push(state),
    setInterventionResult: (result) => {
      calls.result = result;
      calls.stored += 1;
      return true;
    },
    recordIntervention() {}
  });
  replaceModule('utils/analytics.js', { trackEvent() {} });
  let asrCall = 0;
  replaceModule('utils/diagnosis-service.js', {
    callAsrFunction: async () => {
      asrCall += 1;
      return {
        ok: true,
        stage: 'ASR',
        transcript: asrCall === 1
          ? '能去很多地方、节约时间、不晒太阳。'
          : '我原来以为它会很难骑。'
      };
    },
    callInterventionCheck: async (input) => {
      calls.checks.push(input);
      return asrCall === 1 ? {
        ok: true,
        stage: 'INTERVENTION_CHECK',
        result: 'PASS',
        intervention_pass: true,
        original_task_complete: false,
        missing_required_slots: ['expectation_before'],
        slot_state: {
          object: { filled: true, value: '' },
          expectation_before: { filled: false, value: '' },
          experience_after: { filled: true, value: '' }
        }
      } : {
        ok: true,
        stage: 'INTERVENTION_CHECK',
        result: 'PASS',
        intervention_pass: true,
        original_task_complete: true,
        missing_required_slots: [],
        slot_state: {
          object: { filled: true, value: '' },
          expectation_before: { filled: true, value: input.afterTranscript },
          experience_after: input.slotState.experience_after
        }
      };
    }
  });
  global.wx = {
    cloud: { uploadFile: async () => ({ fileID: 'cloud://inline.mp3' }) },
    redirectTo: ({ url, success }) => {
      calls.redirects.push(url);
      if (success) success();
    }
  };

  const page = loadPage();
  page.onLoad();
  page.handlePrimary();
  assert.strictEqual(page.data.inlineIntervention, true);
  assert.deepStrictEqual(calls.transitions, ['INTERVENTION']);
  assert.deepStrictEqual(calls.redirects, []);

  const recording = {
    detail: {
      recorded: true,
      tempFilePath: 'wxfile://inline.mp3',
      durationMs: 2200,
      fileSize: 8000
    }
  };
  await page.handleInlineRecorded(recording);
  assert.strictEqual(calls.stored, 0);
  assert.strictEqual(page.data.inlineState, 'RECORDING');
  assert.strictEqual(page.data.insightCopy.actionPrompt, '你原来以为它会怎么样？');
  assert.ok(calls.checks[0].questionRequiredSlots.includes('expectation_before'));
  assert.strictEqual(calls.checks[0].targetSlot, 'expectation_before');
  assert.strictEqual(calls.checks[0].currentPrompt, '你原来以为它会怎么样？');

  await page.handleInlineRecorded(recording);
  assert.ok(calls.checks[1].beforeTranscript.includes('能去很多地方'));
  assert.strictEqual(calls.checks[1].slotState.experience_after.filled, true);
  assert.strictEqual(calls.stored, 1);
  assert.strictEqual(calls.result.originalTaskComplete, true);
  assert.ok(calls.result.afterText.includes('我原来以为它会很难骑'));
  assert.deepStrictEqual(calls.transitions, ['INTERVENTION', 'MICRO_RESULT']);
  assert.deepStrictEqual(calls.redirects, ['/pages/micro-result/index']);
  console.log('insight inline intervention tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
