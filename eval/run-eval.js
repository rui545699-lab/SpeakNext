const cases = require('./cases');
const { analyzeSignals } = require('../cloudfunctions/analyzeSpeech/lib/signal-analyzer');
const { validateDiagnosis } = require('../cloudfunctions/analyzeSpeech/lib/deepseek-evaluator');
const {
  validateCheckInput,
  validateCheckOutput
} = require('../cloudfunctions/analyzeSpeech/lib/intervention-checker');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function buildDiagnosisActual(item) {
  const signals = analyzeSignals({ transcript: item.transcript, audioDuration: 0, wordList: [] });
  const diagnosis = validateDiagnosis(item.modelOutput, {
    transcript: item.transcript,
    signals,
    question_text: item.question.text,
    question_openness: item.question.openness || 'MEDIUM',
    question_task_type: item.question.taskType,
    question_required_slots: item.question.requiredSlots
  });
  return {
    questionApplicable: diagnosis.question_applicable,
    needsIntervention: diagnosis.needs_intervention,
    primaryIssue: diagnosis.primary_issue,
    recommendedIntervention: diagnosis.recommended_intervention,
    missingRequiredSlots: diagnosis.missing_required_slots,
    lexicalMarkers: signals.explicit_lexical_markers
  };
}

function buildInterventionActual(item) {
  const input = validateCheckInput({
    intervention_type: item.intervention.type,
    before_transcript: item.intervention.beforeTranscript,
    after_transcript: item.transcript,
    anchor: item.intervention.anchor,
    phase: item.intervention.phase,
    original_question: item.question.text,
    question_task_type: item.question.taskType,
    question_required_slots: item.question.requiredSlots,
    slot_state: item.previousSlotState,
    target_slot: item.intervention.targetSlot,
    current_prompt: item.intervention.currentPrompt
  });
  const checked = validateCheckOutput(item.checkerOutput, input);
  const filledSlots = {};
  const evidenceBySlot = {};
  Object.keys(checked.slot_state || {}).forEach((slot) => {
    const state = checked.slot_state[slot];
    if (state.filled) {
      filledSlots[slot] = state.value;
      evidenceBySlot[slot] = state.evidence;
    }
  });
  return {
    interventionPass: checked.intervention_pass,
    originalTaskComplete: checked.original_task_complete,
    missingRequiredSlots: checked.missing_required_slots,
    filledSlots,
    evidenceBySlot,
    slotState: checked.slot_state,
    reason: checked.reason
  };
}

function compareExpected(expected, actual) {
  const failures = [];
  Object.keys(expected).forEach((key) => {
    const expectedValue = expected[key];
    if (key === 'filledSlots' || key === 'evidenceBySlot') {
      Object.keys(expectedValue).forEach((slot) => {
        if (!equal(actual[key] && actual[key][slot], expectedValue[slot])) {
          failures.push({ field: `${key}.${slot}`, expected: expectedValue[slot], actual: actual[key] && actual[key][slot] });
        }
      });
      return;
    }
    if (key === 'unfilledSlots') {
      expectedValue.forEach((slot) => {
        if (actual.slotState && actual.slotState[slot] && actual.slotState[slot].filled) {
          failures.push({ field: `slotState.${slot}.filled`, expected: false, actual: true });
        }
      });
      return;
    }
    if (key === 'forbiddenFacts') {
      const serialized = JSON.stringify(actual);
      expectedValue.forEach((fact) => {
        if (serialized.includes(fact)) failures.push({ field: 'forbiddenFacts', expected: `not ${fact}`, actual: fact });
      });
      return;
    }
    if (key === 'lexicalMarkersInclude') {
      expectedValue.forEach((marker) => {
        if (!actual.lexicalMarkers.includes(marker)) failures.push({ field: 'lexicalMarkers', expected: marker, actual: actual.lexicalMarkers });
      });
      return;
    }
    if (key === 'lexicalMarkersExclude') {
      expectedValue.forEach((marker) => {
        if (actual.lexicalMarkers.includes(marker)) failures.push({ field: 'lexicalMarkers', expected: `not ${marker}`, actual: actual.lexicalMarkers });
      });
      return;
    }
    if (!equal(actual[key], expectedValue)) {
      failures.push({ field: key, expected: expectedValue, actual: actual[key] });
    }
  });
  return failures;
}

const failures = [];
const issueCounts = {};
const issueCoverage = {};
cases.forEach((item) => {
  let actual;
  try {
    actual = item.stage === 'diagnosis'
      ? buildDiagnosisActual(item)
      : buildInterventionActual(item);
    const mismatches = compareExpected(item.expected, actual);
    if (mismatches.length) failures.push({ item, actual, mismatches });
  } catch (error) {
    failures.push({ item, actual: { error: error.message }, mismatches: [{ field: 'exception', expected: 'none', actual: error.message }] });
  }
  if (item.stage === 'diagnosis' && item.expected.primaryIssue) {
    issueCounts[item.expected.primaryIssue] = (issueCounts[item.expected.primaryIssue] || 0) + 1;
  }
  (item.tags || []).forEach((tag) => {
    const match = tag.match(/^(CONTENT_START|CONTENT_EXPAND|LEXICAL_RETRIEVAL|INFORMATION_ORDER|UNCERTAIN)_(POSITIVE|NEGATIVE)$/);
    if (!match) return;
    if (!issueCoverage[match[1]]) issueCoverage[match[1]] = { positive: 0, negative: 0 };
    issueCoverage[match[1]][match[2].toLowerCase()] += 1;
  });
});

const total = cases.length;
const passed = total - failures.length;
const rate = total ? ((passed / total) * 100).toFixed(1) : '0.0';
console.log(`Total: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures.length}`);
console.log(`Pass rate: ${rate}%`);
console.log(`Primary issue cases: ${JSON.stringify(issueCounts)}`);
console.log(`Primary issue coverage: ${JSON.stringify(issueCoverage)}`);

failures.forEach(({ item, actual, mismatches }) => {
  console.log(`\nFAIL ${item.id}`);
  console.log(item.description);
  console.log('expected:');
  console.log(JSON.stringify(item.expected, null, 2));
  console.log('actual:');
  console.log(JSON.stringify(actual, null, 2));
  console.log('mismatches:');
  console.log(JSON.stringify(mismatches, null, 2));
});

if (failures.length) process.exitCode = 1;
