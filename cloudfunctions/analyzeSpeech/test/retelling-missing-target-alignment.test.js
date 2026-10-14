'use strict';

const assert = require('assert');
const materials = require('../../../data/retelling-materials');
const { materialPayload } = require('../../../utils/retelling-service');
const {
  RETELLING_CONTENT_PROMPT_VERSION,
  RETELLING_CONTENT_SYSTEM_PROMPT
} = require('../config/retelling-content-prompt');
const {
  evaluateRetellingDualV057
} = require('../lib/retelling-dual-evaluator');
const {
  validateRetellingContent
} = require('../lib/retelling-content-evaluator');

const MISSING_ALIGNMENT_TRANSCRIPT = '土壤里有带气味的物质。下雨后，这些物质会……就是到了空气里，再随着气溶胶进入鼻腔，所以会闻到土味。';
const rainMaterial = materialPayload(materials.find((item) => item.id === 'retelling_006'));

function response(value, id = 'missing-alignment-test') {
  return {
    id,
    model: 'deepseek-flash',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }]
  };
}

function relation(status, from, to, evidence) {
  return {
    id: 'R2',
    status,
    from_evidence: from || '',
    to_evidence: to || '',
    relation_evidence: evidence || ''
  };
}

function contentResult(material, transcript, keyPoints, r2) {
  return validateRetellingContent({
    key_points: keyPoints,
    relations: [r2],
    incorrect_claims: []
  }, { material, transcript });
}

async function main() {
  assert.strictEqual(
    RETELLING_CONTENT_PROMPT_VERSION,
    'retelling-missing-target-alignment-v0.5.10.2'
  );
  [
    '提到同一个名词',
    '随着气溶胶进入到鼻腔',
    '气泡破裂以后，把土壤里的气味物质带到了空气里',
    '随着气溶胶进入到鼻腔，所以就会闻到一股土味',
    '局部因果成立不代表 retelling_006 的 K2 已覆盖',
    '出现“所以”本身绝不自动代表 CORRECT',
    '跨字段一致性',
    '金属传热更快，所以手上的热量散得更快',
    '平时有空气和骨传导，录音主要只有空气传导，所以声音成分不同',
    '捏住鼻子后闻不到香气，所以整体味道变淡'
  ].forEach((boundary) => assert.ok(RETELLING_CONTENT_SYSTEM_PROMPT.includes(boundary), boundary));

  const missingAlignmentOutput = {
    key_points: [
      { id: 'K2', covered: false, evidence: '' },
      { id: 'K3', covered: true, evidence: '随着气溶胶进入鼻腔，所以会闻到土味' }
    ],
    relations: [relation(
      'MISSING',
      '',
      '随着气溶胶进入鼻腔，所以会闻到土味',
      ''
    )],
    incorrect_claims: [],
    concept_inaccuracy: {
      detected: false,
      user_evidence: '',
      material_evidence: '',
      related_key_point_ids: [],
      reason_code: 'CONCEPT_NONE',
      confidence: 'LOW'
    },
    expression_diagnosis: {
      issue: 'FORMULATION_BREAKDOWN',
      reason_code: 'WORD_SEARCH_INTERRUPTION',
      user_evidence: '这些物质会……就是到了空气里，再随着气溶胶进入鼻腔',
      material_evidence: '气泡上升并破裂时会释放微小气溶胶，并把土壤中的气味物质带入空气。',
      related_key_point_ids: ['K2'],
      confidence: 'HIGH'
    }
  };
  const evaluated = await evaluateRetellingDualV057(
    { material: rainMaterial, transcript: MISSING_ALIGNMENT_TRANSCRIPT },
    async () => response(missingAlignmentOutput)
  );
  assert.strictEqual(evaluated.promptVersion, RETELLING_CONTENT_PROMPT_VERSION);
  assert.strictEqual(evaluated.taskResult.keyPoints.find((point) => point.id === 'K2').covered, false);
  assert.strictEqual(evaluated.taskResult.keyPoints.find((point) => point.id === 'K3').covered, true);
  assert.deepStrictEqual(evaluated.taskResult.missingCorePointIds, ['K2']);
  assert.strictEqual(evaluated.taskResult.taskStatus, 'MISSING_CORE_CONTENT');
  assert.strictEqual(evaluated.routedResult.primaryTrainingNeed, 'MISSING_CAUSAL_STEP');

  const relationCases = [
    {
      id: 'retelling_002',
      transcript: '金属传热更快，所以手上的热量散得更快，摸起来就更冷。',
      from: '金属传热更快',
      to: '手上的热量散得更快，摸起来就更冷'
    },
    {
      id: 'retelling_003',
      transcript: '平时有空气和骨传导，录音主要只有空气传导，所以声音成分不同。',
      from: '平时有空气和骨传导，录音主要只有空气传导',
      to: '声音成分不同'
    },
    {
      id: 'retelling_004',
      transcript: '捏住鼻子后闻不到香气，所以整体味道变淡。',
      from: '捏住鼻子后闻不到香气',
      to: '整体味道变淡'
    }
  ];
  relationCases.forEach((item) => {
    const material = materialPayload(materials.find((entry) => entry.id === item.id));
    const result = contentResult(material, item.transcript, [
      { id: 'K2', covered: true, evidence: item.from },
      { id: 'K3', covered: true, evidence: item.to }
    ], relation('CORRECT', item.from, item.to, item.transcript));
    assert.strictEqual(result.taskStatus, 'PASS', item.id);
    assert.strictEqual(result.relations.find((entry) => entry.id === 'R2').status, 'CORRECT');
  });

  const noKeywordShortcut = contentResult(
    rainMaterial,
    '气味物质进入空气，所以鼻子会制造泥土味。',
    [
      { id: 'K2', covered: true, evidence: '气味物质进入空气' },
      { id: 'K3', covered: true, evidence: '鼻子会制造泥土味' }
    ],
    relation('INCORRECT', '气味物质进入空气', '鼻子会制造泥土味', '气味物质进入空气，所以鼻子会制造泥土味')
  );
  assert.strictEqual(noKeywordShortcut.taskStatus, 'INCORRECT_RELATION');

  console.log('retelling missing target alignment tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
