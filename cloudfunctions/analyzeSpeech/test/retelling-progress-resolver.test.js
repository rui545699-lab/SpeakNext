'use strict';

const assert = require('assert');
const cases = require('../../../eval/retelling-dual-progress-cases');
const {
  resolveRetellingProgress,
  selectProgressEvidence
} = require('../lib/retelling-progress-resolver');

cases.forEach((item) => {
  const actual = resolveRetellingProgress(item);
  assert.strictEqual(actual.originalTrainingNeed, item.originalTrainingNeed, `${item.id} target binding`);
  assert.strictEqual(actual.resolved, item.gold.resolved, `${item.id} resolved`);
  assert.strictEqual(actual.improvementType, item.gold.improvementType, `${item.id} improvementType`);
  assert.strictEqual(actual.reasonCode, item.gold.reasonCode, `${item.id} reasonCode`);
  assert.ok(!actual.beforeEvidence || item.firstRoundResult.transcript.includes(actual.beforeEvidence), `${item.id} before evidence grounding`);
  assert.ok(!actual.afterEvidence || item.secondRoundResult.transcript.includes(actual.afterEvidence), `${item.id} after evidence grounding`);
});

const p10 = cases.find((item) => item.id === 'P10_order_resolved_supporting_omission');
assert.strictEqual(resolveRetellingProgress(p10).resolved, true, 'supporting K4 omission must not block order target');

const p14 = cases.find((item) => item.id === 'P14_incorrect_resolved_with_filler');
assert.strictEqual(resolveRetellingProgress(p14).resolved, true, 'filler must not block corrected relation target');

const p15 = cases.find((item) => item.id === 'P15_order_resolved_relation_not_established');
assert.strictEqual(resolveRetellingProgress(p15).resolved, true, 'relation-not-established may still resolve order target');

const p16 = cases.find((item) => item.id === 'P16_missing_points_present_relation_missing');
assert.strictEqual(resolveRetellingProgress(p16).resolved, false, 'present endpoints without a relation do not resolve missing causal step');

const evidence = selectProgressEvidence(cases[0]);
assert.ok(cases[0].firstRoundResult.transcript.includes(evidence.beforeEvidence));
assert.ok(cases[0].secondRoundResult.transcript.includes(evidence.afterEvidence));

assert.throws(
  () => resolveRetellingProgress({ originalTrainingNeed: 'PASS', firstRoundResult: {}, secondRoundResult: {} }),
  /Unsupported originalTrainingNeed/
);

console.log(`retelling progress resolver tests passed (${cases.length} fixtures)`);
