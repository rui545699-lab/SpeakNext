const assert = require('assert');
const {
  evaluateDiagnosis,
  getSafeHealthcheckDetails,
  EVALUATOR_MAX_TOKENS,
  MAX_EVALUATOR_RETRIES
} = require('../lib/deepseek-evaluator');

const previousApiKey = process.env.DEEPSEEK_API_KEY;
const previousModel = process.env.DEEPSEEK_MODEL;
process.env.DEEPSEEK_API_KEY = 'test-key';
process.env.DEEPSEEK_MODEL = 'deepseek-flash';

const input = {
  question_id: 'q01',
  question_text: '最近有什么体验比预期更好？',
  question_category: 'GENERAL_EXPERIENCE',
  question_openness: 'MEDIUM',
  transcript: '这个地方挺舒服的。',
  signals: { word_count: 9 }
};

const diagnosisContent = JSON.stringify({
  needs_intervention: true,
  primary_issue: 'CONTENT_EXPAND',
  confidence: 0.9,
  evidence: [{ text: '挺舒服的', type: 'abstract_judgment' }],
  question_factor: 'NONE',
  recommended_intervention: 'MODEL_VALUE_IS_IGNORED'
});

function response(content, finishReason = 'stop', id = 'request-1') {
  return {
    id,
    model: 'deepseek-flash',
    choices: [{
      finish_reason: finishReason,
      message: { content }
    }]
  };
}

async function expectFailure(type, createResponse) {
  let calls = 0;
  try {
    await evaluateDiagnosis(input, async () => {
      calls += 1;
      return createResponse(calls);
    });
    assert.fail(`Expected ${type}`);
  } catch (error) {
    assert.strictEqual(error.message, type);
    assert.strictEqual(calls, MAX_EVALUATOR_RETRIES + 1);
    assert.strictEqual(getSafeHealthcheckDetails(error).errorType, type);
  }
}

(async () => {
  await expectFailure('EMPTY_MODEL_OUTPUT', () => response(''));
  await expectFailure('OUTPUT_TRUNCATED', () => response('{"primary_issue":', 'length'));
  await expectFailure('OUTPUT_PARSE_ERROR', () => response('{"primary_issue":'));

  let retryCalls = 0;
  let capturedPayload;
  const retried = await evaluateDiagnosis(input, async (payload) => {
    capturedPayload = payload;
    retryCalls += 1;
    return retryCalls === 1 ? response('', 'stop', 'request-empty') : response(diagnosisContent, 'stop', 'request-ok');
  });
  assert.strictEqual(retryCalls, 2);
  assert.strictEqual(retried.diagnosis.primary_issue, 'CONTENT_EXPAND');
  assert.strictEqual(retried.diagnosis.needs_intervention, true);
  assert.strictEqual(retried.diagnosis.recommended_intervention, 'ONE_DETAIL');
  assert.deepStrictEqual(capturedPayload.response_format, { type: 'json_object' });
  assert.deepStrictEqual(capturedPayload.thinking, { type: 'disabled' });
  assert.strictEqual(capturedPayload.max_tokens, EVALUATOR_MAX_TOKENS);
  assert.strictEqual(EVALUATOR_MAX_TOKENS, 1500);

  let successCalls = 0;
  const successful = await evaluateDiagnosis(input, async () => {
    successCalls += 1;
    return response(diagnosisContent);
  });
  assert.strictEqual(successCalls, 1);
  assert.strictEqual(successful.modelVersion, 'deepseek-flash');
  assert.strictEqual(successful.diagnosis.primary_issue, 'CONTENT_EXPAND');

  if (previousApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = previousApiKey;
  if (previousModel === undefined) delete process.env.DEEPSEEK_MODEL;
  else process.env.DEEPSEEK_MODEL = previousModel;
  console.log('evaluator-output tests passed');
})().catch((error) => {
  if (previousApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = previousApiKey;
  if (previousModel === undefined) delete process.env.DEEPSEEK_MODEL;
  else process.env.DEEPSEEK_MODEL = previousModel;
  console.error(error);
  process.exit(1);
});
