'use strict';

const assert = require('assert');
const {
  resolveRetellingProgress
} = require('../lib/retelling-progress-resolver');

function span(transcript, text) {
  const start = text ? transcript.indexOf(text) : -1;
  return start < 0 ? null : { text, start, end: start + text.length };
}

function point(transcript, id, evidence) {
  const grounded = span(transcript, evidence);
  return {
    id,
    covered: Boolean(grounded),
    evidence: grounded ? grounded.text : '',
    start: grounded ? grounded.start : -1,
    end: grounded ? grounded.end : -1
  };
}

function round({ transcript, taskStatus, k2 = '', k3 = '', relationStatus = 'MISSING', relationEvidence = '' }) {
  const relationSpan = span(transcript, relationEvidence);
  return {
    transcript,
    taskResult: {
      taskStatus,
      coreMeaningClear: taskStatus === 'PASS',
      coreFactsComplete: Boolean(k2 && k3),
      missingCorePointIds: [k2 ? null : 'K2', k3 ? null : 'K3'].filter(Boolean),
      keyPoints: [point(transcript, 'K2', k2), point(transcript, 'K3', k3)],
      relations: [{
        id: 'R2',
        status: relationStatus,
        fromEvidence: k2,
        toEvidence: k3,
        relationEvidence,
        fromSpan: span(transcript, k2),
        toSpan: span(transcript, k3),
        relationSpan
      }],
      incorrectClaims: []
    },
    processResult: { processIssue: 'NONE', evidence: [] },
    routedResult: {
      primaryTrainingNeed: taskStatus === 'PASS' ? 'PASS'
        : taskStatus === 'UNCERTAIN' ? 'UNCERTAIN' : 'MISSING_CAUSAL_STEP',
      evidence: []
    }
  };
}

const first = round({
  transcript: '土地中有特殊气味的东西，雨滴落地后把它们裹挟到空气中，进入气溶胶，再进入鼻腔。',
  taskStatus: 'UNCERTAIN'
});

function resolve(secondRoundResult) {
  return resolveRetellingProgress({
    originalTrainingNeed: 'UNCERTAIN',
    originalRetryScope: 'FULL_CONTENT',
    firstRoundResult: first,
    secondRoundResult
  });
}

const clarifiedButMissingTranscript = '土壤里有特殊气味的物质，它们随着气溶胶进入鼻腔，所以会闻到土味。';
const clarifiedButMissing = resolve(round({
  transcript: clarifiedButMissingTranscript,
  taskStatus: 'MISSING_CORE_CONTENT',
  k3: '它们随着气溶胶进入鼻腔，所以会闻到土味'
}));
assert.strictEqual(clarifiedButMissing.resolved, false);
assert.strictEqual(clarifiedButMissing.improvementType, 'EVIDENCE_CLARIFIED');
assert.strictEqual(clarifiedButMissing.reasonCode, 'UNCERTAIN_CLARIFIED_ISSUE_REMAINS');
assert.strictEqual(clarifiedButMissing.coreMeaningClearAfter, false);
assert.notStrictEqual(clarifiedButMissing.reasonCode, 'SECOND_ROUND_BECAME_EVALUABLE');

const passTranscript = '气泡破裂后把气味物质带入空气，这些物质进入鼻腔，所以会闻到泥土味。';
const pass = resolve(round({
  transcript: passTranscript,
  taskStatus: 'PASS',
  k2: '气泡破裂后把气味物质带入空气',
  k3: '这些物质进入鼻腔，所以会闻到泥土味',
  relationStatus: 'CORRECT',
  relationEvidence: passTranscript
}));
assert.strictEqual(pass.resolved, true);
assert.strictEqual(pass.improvementType, 'EVIDENCE_CLARIFIED');
assert.strictEqual(pass.reasonCode, 'UNCERTAIN_CLARIFIED_PASS');
assert.strictEqual(pass.coreMeaningClearAfter, true);

const stillUncertain = resolve(round({
  transcript: '我还是不太明白。',
  taskStatus: 'UNCERTAIN'
}));
assert.strictEqual(stillUncertain.resolved, false);
assert.strictEqual(stillUncertain.improvementType, null);
assert.strictEqual(stillUncertain.reasonCode, 'SECOND_ROUND_STILL_UNCERTAIN');

console.log('retelling UNCERTAIN progress semantics regression tests passed (clarified missing + pass + uncertain)');
