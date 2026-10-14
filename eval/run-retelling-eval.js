const cases = require('./retelling-cases');
const { validateRetellingEvaluation } = require('../cloudfunctions/analyzeSpeech/lib/retelling-evaluator');

let passed = 0;
const results = cases.map((item) => {
  const output = validateRetellingEvaluation(item.modelOutput, {
    material: item.material,
    transcript: item.transcript
  });
  const actual = output.primary_training_need;
  const ok = actual === item.gold
    && output.recommended_action === (item.gold == null ? 'PASS' : item.modelOutput.recommended_action);
  if (ok) passed += 1;
  return { id: item.id, expected: item.gold || 'PASS', actual: actual || 'PASS', ok };
});

results.forEach((item) => console.log(`${item.id}: ${item.ok ? 'PASS' : 'FAIL'} (${item.actual})`));
console.log(`Total: ${results.length}`);
console.log(`Passed: ${passed}`);
if (passed !== results.length) process.exitCode = 1;
