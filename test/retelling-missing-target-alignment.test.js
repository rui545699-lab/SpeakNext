'use strict';

const assert = require('assert');
const materials = require('../data/retelling-materials');
const { buildMissingHintQuestion } = require('../utils/retelling-feedback-presenter');

const rainMaterial = materials.find((item) => item.id === 'retelling_006');
const hint = buildMissingHintQuestion({
  material: rainMaterial,
  taskResult: {
    taskStatus: 'MISSING_CORE_CONTENT',
    missingCorePointIds: ['K2'],
    relations: [{ id: 'R2', status: 'MISSING' }]
  }
});

assert.deepStrictEqual(hint, {
  text: '雨滴落到多孔地面后，土壤里的气味物质怎样进入空气？',
  targetId: 'K2',
  source: 'MATERIAL_MISSING_HINT_QUESTION'
});
assert.notStrictEqual(hint.text, rainMaterial.missingHintQuestions.R2);

const relationFallback = buildMissingHintQuestion({
  material: rainMaterial,
  taskResult: {
    taskStatus: 'RELATION_NOT_ESTABLISHED',
    missingCorePointIds: [],
    relations: [{ id: 'R2', status: 'MISSING' }]
  }
});
assert.strictEqual(relationFallback.targetId, 'R2');

console.log('retelling missing target presenter tests passed');
