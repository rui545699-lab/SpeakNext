const assert = require('assert');
const { getUncertainCopy } = require('../utils/uncertain-copy');

const tooOpen = getUncertainCopy('TOO_OPEN');
assert.ok(tooOpen.lead.includes('停顿或犹豫'));
assert.ok(tooOpen.body.includes('问题太开放'));
assert.ok(tooOpen.body.includes('不能可靠判断'));

const asrUncertain = getUncertainCopy('ASR_UNCERTAIN');
assert.ok(asrUncertain.body.includes('语音识别不够稳定'));

const none = getUncertainCopy('NONE', { long_pause_count: 2, filler_count: 0, start_latency_ms: 0 });
assert.ok(none.body.includes('暂时无法可靠判断'));

const smooth = getUncertainCopy('NONE', {
  long_pause_count: 0,
  filler_count: 0,
  start_latency_ms: 0,
  explicit_lexical_markers: []
});
assert.ok(smooth.lead.includes('表达比较顺'));

const other = getUncertainCopy('OTHER');
assert.ok(other.lead.includes('值得继续观察'));
assert.deepStrictEqual(getUncertainCopy('UNKNOWN_FACTOR'), other);

Object.keys({ TOO_OPEN: 1, ASR_UNCERTAIN: 1, NONE: 1, OTHER: 1 }).forEach((factor) => {
  const copy = getUncertainCopy(factor);
  assert.ok(!`${copy.lead}${copy.body}`.includes('没听出特别明显的卡点'));
});

console.log('uncertain-copy tests passed');
