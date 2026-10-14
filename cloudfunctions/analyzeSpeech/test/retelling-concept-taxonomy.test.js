'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const { validateRetellingContent } = require('../lib/retelling-content-evaluator');
const { composeRetellingV057Evaluation } = require('../lib/retelling-dual-evaluator');
const { resolveRetellingProgress } = require('../lib/retelling-progress-resolver');

const material = materialPayload(materials.find((item) => item.id === 'retelling_001'));

function raw(transcript, options = {}) {
  const k2 = options.k2 || '这个感受器负责感知高温';
  const k3 = options.k3 || '所以人会觉得灼热';
  return {
    core_meaning_clear: true,
    key_points: material.key_points.map((point) => ({
      id: point.id,
      covered: point.id === 'K2' || point.id === 'K3',
      evidence: point.id === 'K2' ? k2 : point.id === 'K3' ? k3 : ''
    })),
    relations: material.relations.map((relation) => relation.id === 'R2'
      ? {
        id: 'R2',
        status: options.relationStatus || 'CORRECT',
        from_evidence: k2,
        to_evidence: k3,
        relation_evidence: transcript
      }
      : { id: relation.id, status: 'MISSING', from_evidence: '', to_evidence: '', relation_evidence: '' }),
    incorrect_claims: [],
    concept_inaccuracy: options.concept || {
      detected: false,
      user_evidence: '',
      material_evidence: '',
      related_key_point_ids: [],
      reason_code: 'CONCEPT_NONE',
      confidence: 'LOW'
    },
    expression_diagnosis: options.expression || {
      issue: 'NONE', reason_code: 'EXPRESSION_NONE', user_evidence: '', material_evidence: '',
      related_key_point_ids: [], confidence: 'LOW'
    }
  };
}

function evaluate(transcript, rawEvaluation) {
  const input = { material, transcript };
  const task = validateRetellingContent(rawEvaluation, input);
  return composeRetellingV057Evaluation(input, task, rawEvaluation);
}

// 1. 明显概念错误。
const conceptTranscript = '这个感受器负责控制人体温度，所以人会觉得灼热';
const conceptRaw = raw(conceptTranscript, {
  k2: '这个感受器负责控制人体温度',
  concept: {
    detected: true,
    user_evidence: '负责控制人体温度',
    material_evidence: '感受器也参与对高温和灼热刺激的感知',
    related_key_point_ids: ['K2'],
    reason_code: 'FUNCTION_CHANGED',
    confidence: 'HIGH'
  },
  expression: {
    issue: 'WORDING_PRECISION', reason_code: 'WORDING', user_evidence: '控制',
    material_evidence: '感知', related_key_point_ids: ['K2'], confidence: 'HIGH'
  }
});
const case1 = evaluate(conceptTranscript, conceptRaw);
assert.strictEqual(case1.taskResult.taskStatus, 'CONCEPT_INACCURACY');
assert.strictEqual(case1.processResult.expressionIssue, 'NONE');
assert.strictEqual(case1.routedResult.primaryTrainingNeed, 'CONCEPT_INACCURACY');

// 2. 理解正确、局部词略偏。
const wordingTranscript = '这个感受器负责侦测高温，所以人会觉得灼热';
const case2 = evaluate(wordingTranscript, raw(wordingTranscript, {
  k2: '这个感受器负责侦测高温',
  expression: {
    issue: 'WORDING_PRECISION', reason_code: 'LOCAL_TERM_IMPRECISE', user_evidence: '侦测高温',
    material_evidence: '高温和灼热刺激的感知', related_key_point_ids: ['K2'], confidence: 'HIGH'
  }
}));
assert.strictEqual(case2.taskResult.taskStatus, 'PASS');
assert.strictEqual(case2.routedResult.primaryTrainingNeed, 'WORDING_PRECISION');

// 3. 自然同义改写。
const synonymTranscript = '这个感受器负责感知很高的温度和灼烧刺激，所以人会觉得灼热';
const case3 = evaluate(synonymTranscript, raw(synonymTranscript, {
  k2: '这个感受器负责感知很高的温度和灼烧刺激'
}));
assert.strictEqual(case3.routedResult.primaryTrainingNeed, 'PASS');

// 4. 明确错误关系由 Content 优先。
const reverseTranscript = '因为人先觉得灼热，所以这个感受器才负责感知高温';
const case4 = evaluate(reverseTranscript, raw(reverseTranscript, {
  k2: '这个感受器才负责感知高温',
  k3: '人先觉得灼热',
  relationStatus: 'INCORRECT',
  expression: {
    issue: 'FORMULATION_BREAKDOWN', reason_code: 'CLAUSE_FORMATION_INTERRUPTED',
    user_evidence: reverseTranscript, material_evidence: '', related_key_point_ids: ['K2'], confidence: 'HIGH'
  }
}));
assert.strictEqual(case4.taskResult.taskStatus, 'INCORRECT_RELATION');
assert.strictEqual(case4.routedResult.primaryTrainingNeed, 'CONCEPT_INACCURACY');

// 5. 概念错误与句子断裂同时出现，概念优先。
assert.strictEqual(case1.routedResult.primaryTrainingNeed, 'CONCEPT_INACCURACY');

// 6. material evidence 不 grounded 时不能触发 concept，也不能降级 wording。
const case6Raw = raw(wordingTranscript, {
  k2: '这个感受器负责侦测高温',
  concept: {
    detected: true, user_evidence: '侦测高温', material_evidence: '模型编写的标准答案',
    related_key_point_ids: ['K2'], reason_code: 'FUNCTION_CHANGED', confidence: 'HIGH'
  },
  expression: {
    issue: 'WORDING_PRECISION', reason_code: 'LOCAL_TERM_IMPRECISE', user_evidence: '侦测高温',
    material_evidence: '高温和灼热刺激的感知', related_key_point_ids: ['K2'], confidence: 'HIGH'
  }
});
const case6 = evaluate(wordingTranscript, case6Raw);
assert.strictEqual(case6.taskResult.conceptInaccuracy.detected, false);
assert.strictEqual(case6.processResult.expressionIssue, 'NONE');
assert.strictEqual(case6.routedResult.primaryTrainingNeed, 'PASS');

function progressRound(transcript, taskStatus, detected, coveredIds) {
  return {
    transcript,
    taskResult: {
      taskStatus,
      conceptInaccuracy: detected ? {
        detected: true,
        userEvidence: { text: transcript, start: 0, end: transcript.length },
        materialEvidence: case1.taskResult.conceptInaccuracy.materialEvidence,
        relatedKeyPointIds: ['K2'],
        reasonCode: 'FUNCTION_CHANGED', confidence: 'HIGH'
      } : { detected: false, relatedKeyPointIds: [] },
      keyPoints: ['K1', 'K2', 'K3', 'K4', 'K5'].map((id) => ({
        id, covered: coveredIds.includes(id), evidence: coveredIds.includes(id) ? transcript : '',
        start: coveredIds.includes(id) ? 0 : -1, end: coveredIds.includes(id) ? transcript.length : -1
      })),
      relations: [], incorrectClaims: []
    },
    processResult: { processIssue: 'NONE', expressionIssue: 'NONE' },
    routedResult: { primaryTrainingNeed: detected ? 'CONCEPT_INACCURACY' : 'PASS' }
  };
}

const firstRound = Object.assign({}, case1, { transcript: conceptTranscript });
// 7. 删除目标内容不能 resolved。
const deleted = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY', firstRoundResult: firstRound,
  secondRoundResult: progressRound('人会觉得灼热', 'MISSING_CORE_CONTENT', false, ['K3'])
});
assert.strictEqual(deleted.resolved, false);
assert.strictEqual(deleted.reasonCode, 'TARGET_CONTENT_REMOVED');

const stillWrong = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY', firstRoundResult: firstRound,
  secondRoundResult: progressRound('这个感受器还是负责控制温度', 'CONCEPT_INACCURACY', true, ['K2'])
});
assert.strictEqual(stillWrong.resolved, false);
assert.strictEqual(stillWrong.reasonCode, 'CONCEPT_INACCURACY_STILL_PRESENT');

// 8. 保留目标内容且修正概念。
const correctedTranscript = '这个感受器负责感知高温，所以人会觉得灼热';
const corrected = resolveRetellingProgress({
  originalTrainingNeed: 'CONCEPT_INACCURACY', firstRoundResult: firstRound,
  secondRoundResult: progressRound(correctedTranscript, 'PASS', false, ['K2', 'K3'])
});
assert.strictEqual(corrected.resolved, true);
assert.strictEqual(corrected.improvementType, 'CONCEPT_CORRECTED');

// 9/10. 背景信息先出现但逻辑清楚，不进入 INFORMATION_ORDER。
[
  ['retelling_002', '金属和木头温度接近。手比它们暖，金属更快带走手上的热量，所以皮肤降温更快，摸起来更冷。'],
  ['retelling_006', '土壤里本来有土臭素。雨滴形成的气泡破裂后把气味物质带进空气，所以人会闻到泥土味。']
].forEach(([id, transcript]) => {
  const input = { material: materialPayload(materials.find((item) => item.id === id)), transcript };
  const task = {
    taskStatus: 'PASS', coreMeaningClear: true, coreFactsComplete: true, missingCorePointIds: [],
    requiresNewContent: false, keyPoints: [], relations: [], incorrectClaims: [],
    conceptInaccuracy: { detected: false, relatedKeyPointIds: [], confidence: 'LOW' }
  };
  const result = composeRetellingV057Evaluation(input, task, {
    expression_diagnosis: { issue: 'NONE' }
  });
  assert.strictEqual(result.routedResult.primaryTrainingNeed, 'PASS');
  assert.notStrictEqual(result.routedResult.primaryTrainingNeed, 'INFORMATION_ORDER');
});

console.log('retelling concept taxonomy tests passed (10 regressions)');
