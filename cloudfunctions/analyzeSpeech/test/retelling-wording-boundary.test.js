'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const { composeRetellingV057Evaluation } = require('../lib/retelling-dual-evaluator');
const {
  RETELLING_EXPRESSION_PROMPT_VERSION,
  RETELLING_EXPRESSION_SYSTEM_PROMPT
} = require('../config/retelling-expression-prompt');

function getMaterial(id) {
  return materialPayload(materials.find((item) => item.id === id));
}

function point(id, transcript, covered) {
  return {
    id,
    covered,
    evidence: covered ? transcript : '',
    start: covered ? 0 : -1,
    end: covered ? transcript.length : -1
  };
}

function task(transcript, status = 'PASS', options = {}) {
  const covered = status === 'PASS' || status === 'CONCEPT_INACCURACY';
  return {
    taskStatus: status,
    coreMeaningClear: status === 'PASS',
    coreFactsComplete: covered,
    missingCorePointIds: covered ? [] : ['K2'],
    requiresNewContent: status === 'MISSING_CORE_CONTENT',
    keyPoints: ['K1', 'K2', 'K3', 'K4', 'K5'].map((id) => point(
      id,
      transcript,
      covered && ['K2', 'K3'].includes(id)
    )),
    relations: [],
    incorrectClaims: [],
    conceptInaccuracy: options.conceptInaccuracy || {
      detected: false,
      userEvidence: null,
      materialEvidence: null,
      relatedKeyPointIds: [],
      reasonCode: 'CONCEPT_NONE',
      confidence: 'LOW'
    }
  };
}

function expression(issue, userEvidence, materialEvidence, ids, reasonCode = 'EXPRESSION_NONE') {
  return {
    expression_diagnosis: {
      issue,
      reason_code: reasonCode,
      user_evidence: userEvidence || '',
      material_evidence: materialEvidence || '',
      related_key_point_ids: ids || [],
      confidence: issue === 'NONE' ? 'LOW' : 'HIGH'
    }
  };
}

function compose(materialId, transcript, taskResult, rawEvaluation) {
  return composeRetellingV057Evaluation(
    { material: getMaterial(materialId), transcript },
    taskResult,
    rawEvaluation
  );
}

// 1. Vague reference -> WORDING_PRECISION.
const w1 = '平时听自己的声音，既有空气传导，也有骨传导。录音的时候主要是空气传导，所以听到的东西不太一样，最后就会觉得自己的声音比较陌生。';
let result = compose('retelling_003', w1, task(w1), expression(
  'WORDING_PRECISION',
  '听到的东西不太一样',
  '声音成分不同',
  ['K3'],
  'VAGUE_REFERENCE'
));
assert.strictEqual(result.processResult.expressionIssue, 'WORDING_PRECISION');
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'WORDING_PRECISION');

// 2. Imprecise mechanism verb -> WORDING_PRECISION.
const w2 = '金属和木头温度其实差不多，但是金属处理热量会更快，所以手上的热量会更快被带走，手会降温得更快，因此感觉金属更冷。';
result = compose('retelling_002', w2, task(w2), expression(
  'WORDING_PRECISION',
  '金属处理热量会更快',
  '金属传递热量的速度比木头更快',
  ['K2'],
  'IMPRECISE_MECHANISM_WORD'
));
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'WORDING_PRECISION');

// 3. Natural precise paraphrase -> PASS.
const precise = '金属和木头实际温度差不多，但是金属传递热量更快，手上的热量会更快被带走，所以摸起来会觉得金属更冷。';
result = compose('retelling_002', precise, task(precise), expression('NONE'));
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'PASS');

// 4. Material wording differs but semantics are precise -> PASS.
const natural = '平时还会通过骨头听见自己的声音，录音回放主要从空气传进耳朵，所以听到的声音和平时不同。';
result = compose('retelling_003', natural, task(natural), expression('NONE'));
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'PASS');

// 5. Concept error cannot be downgraded to WORDING.
const conceptText = '这个感受器负责控制人体温度，所以人会觉得灼热。';
const concept = {
  detected: true,
  userEvidence: { text: '负责控制人体温度', start: 6, end: 14 },
  materialEvidence: {
    text: '感受器也参与对高温和灼热刺激的感知', start: 0, end: 19, field: 'key_points.K2.text'
  },
  relatedKeyPointIds: ['K2'],
  reasonCode: 'FUNCTION_CHANGED',
  confidence: 'HIGH'
};
result = compose('retelling_001', conceptText, task(conceptText, 'CONCEPT_INACCURACY', {
  conceptInaccuracy: concept
}), expression(
  'WORDING_PRECISION', '控制人体温度', '高温和灼热刺激的感知', ['K2'], 'LOCAL_TERM_IMPRECISE'
));
assert.strictEqual(result.processResult.expressionIssue, 'NONE');
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'CONCEPT_INACCURACY');

// 6. Explicit word search remains FORMULATION_BREAKDOWN.
const wordSearch = '录音里少了那个词怎么说，骨头传进来的那部分，所以听起来陌生。';
result = compose('retelling_003', wordSearch, task(wordSearch), expression('NONE'));
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'FORMULATION_BREAKDOWN');

// 7. Missing content keeps Content priority.
const missing = '金属摸起来比较冷。';
result = compose('retelling_002', missing, task(missing, 'MISSING_CORE_CONTENT'), expression(
  'WORDING_PRECISION', '比较冷', '金属传递热量的速度比木头更快', ['K2'], 'LOCAL_TERM_IMPRECISE'
));
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');

// 8. Filler alone remains PASS/NONE.
const filler = '嗯，金属传递热量更快，所以手上的热量更快被带走，摸起来就更冷。';
result = compose('retelling_002', filler, task(filler), expression('NONE'));
assert.strictEqual(result.processResult.expressionIssue, 'NONE');
assert.strictEqual(result.routedResult.primaryTrainingNeed, 'PASS');

assert.strictEqual(RETELLING_EXPRESSION_PROMPT_VERSION, 'retelling-target-retention-boundary-v0.5.9b.2');
['听到的东西不太一样', '金属处理热量会更快', '金属传递热量更快', '声音成分不一样']
  .forEach((example) => assert.ok(RETELLING_EXPRESSION_SYSTEM_PROMPT.includes(example)));
['录音和平时听到的声音成分不一样', '所以录音里的自己会觉得很陌生', '录音里的声音会变得更响']
  .forEach((example) => assert.ok(RETELLING_EXPRESSION_SYSTEM_PROMPT.includes(example)));

const analyzerSource = fs.readFileSync(path.resolve(
  __dirname,
  '..',
  'lib',
  'retelling-expression-analyzer.js'
), 'utf8');
assert.strictEqual(analyzerSource.includes('听到的东西不太一样'), false);
assert.strictEqual(analyzerSource.includes('金属处理热量会更快'), false);

console.log('retelling wording boundary tests passed (8 regressions)');
