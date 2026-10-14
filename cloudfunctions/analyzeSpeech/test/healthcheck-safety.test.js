const assert = require('assert');
const {
  getSafeHealthcheckMessage,
  getSafeHealthcheckDetails,
  sanitizeProviderText,
  sanitizeBaseUrl,
  getDeepSeekEndpoint
} = require('../lib/deepseek-evaluator');

assert.strictEqual(
  getSafeHealthcheckMessage(new Error('DEEPSEEK_API_KEY_MISSING')),
  'DEEPSEEK_API_KEY 未配置。'
);
assert.strictEqual(
  getSafeHealthcheckDetails(Object.assign(new Error('DEEPSEEK_HTTP_ERROR'), { httpStatus: 401 })).errorType,
  'AUTH_ERROR'
);
assert.strictEqual(
  getSafeHealthcheckMessage(Object.assign(new Error('DEEPSEEK_HTTP_ERROR'), { httpStatus: 401 })),
  'DeepSeek 鉴权失败，请检查云函数服务端环境变量。'
);
assert.strictEqual(
  getSafeHealthcheckMessage(Object.assign(new Error('DEEPSEEK_HTTP_ERROR'), { httpStatus: 500 })),
  'DeepSeek 服务暂时异常。'
);
assert.ok(!getSafeHealthcheckMessage(new Error('secret-value')).includes('secret-value'));
assert.strictEqual(sanitizeProviderText('Bearer secret-token'), 'Bearer [REDACTED]');
assert.strictEqual(sanitizeProviderText('a'.repeat(700)).length, 500);
assert.strictEqual(sanitizeBaseUrl('https://user:password@api.deepseek.com/path?token=secret'), 'https://api.deepseek.com/path');

const previousBaseUrl = process.env.DEEPSEEK_BASE_URL;
process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
assert.strictEqual(getDeepSeekEndpoint(), 'https://api.deepseek.com/chat/completions');
process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions';
assert.strictEqual(getDeepSeekEndpoint(), 'https://api.deepseek.com/chat/completions');
if (previousBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
else process.env.DEEPSEEK_BASE_URL = previousBaseUrl;

assert.strictEqual(
  getSafeHealthcheckDetails(Object.assign(new Error('DEEPSEEK_HTTP_ERROR'), { httpStatus: 402 })).errorType,
  'BILLING_ERROR'
);
assert.strictEqual(
  getSafeHealthcheckDetails(Object.assign(new Error('DEEPSEEK_HTTP_ERROR'), { httpStatus: 404 })).errorType,
  'ENDPOINT_OR_MODEL_ERROR'
);
assert.strictEqual(
  getSafeHealthcheckDetails(new Error('DEEPSEEK_HEALTHCHECK_RESPONSE_PARSE_ERROR')).errorType,
  'RESPONSE_PARSE_ERROR'
);
const emptyResponse = Object.assign(new Error('DEEPSEEK_HEALTHCHECK_EMPTY_CONTENT'), {
  providerCode: 'stop',
  providerMessage: 'DeepSeek 返回了空 message.content，finish_reason=stop。'
});
assert.strictEqual(getSafeHealthcheckDetails(emptyResponse).errorType, 'RESPONSE_PARSE_ERROR');
assert.strictEqual(getSafeHealthcheckDetails(emptyResponse).providerCode, 'stop');
console.log('healthcheck-safety tests passed');
