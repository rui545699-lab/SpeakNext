const deterministicCases = require('./cases');
const { analyzeSignals } = require('../cloudfunctions/analyzeSpeech/lib/signal-analyzer');

const SELECTED = [
  ['E01_complete_experience', true, false, null, null],
  ['E14_short_complete_choice', true, false, null, null],
  ['E19_normal_then_repetition', true, false, null, null],
  ['E20_many_fillers_complete', true, false, null, null],
  ['E03_cannot_start', true, true, 'CONTENT_START', 'NARROW_SCOPE'],
  ['E26_content_start_object_absent', true, true, 'CONTENT_START', 'NARROW_SCOPE'],
  ['E32_temporary_unknown', true, true, 'CONTENT_START', 'NARROW_SCOPE'],
  ['E02_object_and_current_feeling', true, true, 'CONTENT_EXPAND', 'ONE_DETAIL'],
  ['E16_reason_missing', true, true, 'CONTENT_EXPAND', 'ONE_DETAIL'],
  ['E27_expand_minimal_reason', true, true, 'CONTENT_EXPAND', 'ONE_DETAIL'],
  ['E05_lexical_context', true, true, 'LEXICAL_RETRIEVAL', 'SEMANTIC_CONTRAST'],
  ['E06_explicit_lexical_marker', true, true, 'LEXICAL_RETRIEVAL', 'SEMANTIC_CONTRAST'],
  ['E23_lexical_over_expand', true, true, 'LEXICAL_RETRIEVAL', 'SEMANTIC_CONTRAST'],
  ['E15_information_order_positive', true, true, 'INFORMATION_ORDER', 'CHOOSE_FIRST_MESSAGE'],
  ['E25_information_order_second_positive', true, true, 'INFORMATION_ORDER', 'CHOOSE_FIRST_MESSAGE'],
  ['E24_uncertain_open_question', true, true, 'UNCERTAIN', 'OBSERVE_AGAIN'],
  ['E29_uncertain_asr', true, true, 'UNCERTAIN', 'OBSERVE_AGAIN'],
  ['E04_not_applicable_difference', false, false, null, null],
  ['E31_not_applicable_no_app', false, false, null, null],
  ['E18_lexical_false_positive', true, true, 'CONTENT_EXPAND', 'ONE_DETAIL']
];

const CATEGORY_BY_TASK = Object.freeze({
  EXPERIENCE_COMPARE: 'GENERAL_EXPERIENCE',
  REASON_EXPLAIN: 'PLACE',
  OPINION_DIFFERENCE: 'APP_PRODUCT',
  SIMPLE_EXPERIENCE: 'GENERAL_EXPERIENCE',
  CHOICE_REASON: 'CHOICE'
});

const byId = new Map(deterministicCases.map((item) => [item.id, item]));

module.exports = SELECTED.map((definition) => {
  const [id, questionApplicable, needsIntervention, primaryIssue, recommendedIntervention] = definition;
  const source = byId.get(id);
  if (!source || source.stage !== 'diagnosis') throw new Error(`LIVE_CASE_SOURCE_INVALID:${id}`);
  const signals = analyzeSignals({ transcript: source.transcript, audioDuration: 0, wordList: [] });
  return {
    id,
    description: source.description,
    question: Object.assign({}, source.question, {
      category: CATEGORY_BY_TASK[source.question.taskType] || 'OTHER'
    }),
    transcript: source.transcript,
    signals,
    gold: {
      questionApplicable,
      needsIntervention,
      primaryIssue,
      recommendedIntervention
    },
    acceptablePrimaryIssues: [],
    scored: true,
    futureIssue: null
  };
});
