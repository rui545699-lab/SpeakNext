const assert = require('assert');
const { sanitizeAsrText, getSafeAsrError } = require('../lib/asr-error');

assert.strictEqual(sanitizeAsrText('Bearer secret-token'), 'Bearer [REDACTED]');
assert.strictEqual(sanitizeAsrText('a'.repeat(700)).length, 500);
assert.strictEqual(
  getSafeAsrError(Object.assign(new Error('invalid credential'), { code: 'AuthFailure.SecretIdNotFound' })).errorType,
  'AUTH_ERROR'
);
assert.strictEqual(
  getSafeAsrError(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })).errorType,
  'NETWORK_ERROR'
);
assert.strictEqual(
  getSafeAsrError(Object.assign(new Error('empty'), { code: 'EMPTY_AUDIO' })).errorType,
  'EMPTY_AUDIO'
);
console.log('asr-error tests passed');
