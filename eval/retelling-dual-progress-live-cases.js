'use strict';

const deterministicCases = require('./retelling-dual-progress-cases');
const material = require('./retelling-cases')[0].material;

const LIVE_CASE_IDS = Object.freeze(deterministicCases.map((item) => item.id));

const cases = LIVE_CASE_IDS.map((id) => {
  const fixture = deterministicCases.find((item) => item.id === id);
  if (!fixture) throw new Error(`Missing deterministic Progress fixture: ${id}`);
  return Object.freeze({
    id: fixture.id,
    sourceFixtureId: fixture.id,
    material,
    originalTrainingNeed: fixture.originalTrainingNeed,
    firstRoundResult: fixture.firstRoundResult,
    secondTranscript: fixture.secondRoundResult.transcript,
    gold: Object.freeze({
      secondTask: fixture.gold.secondTask,
      secondProcess: fixture.gold.secondProcess,
      resolved: fixture.gold.resolved,
      improvementType: fixture.gold.improvementType,
      reasonCode: fixture.gold.reasonCode
    })
  });
});

module.exports = Object.freeze(cases);
