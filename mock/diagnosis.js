const { ISSUE_TYPES } = require('../utils/constants');

const ENABLE_DEBUG_ENTRY = true;

const diagnoses = {
  [ISSUE_TYPES.CONTENT_EXPAND]: {
    primaryIssue: ISSUE_TYPES.CONTENT_EXPAND,
    confidence: 0.89,
    evidenceText: '这个应用用起来比较方便。',
    interventionType: 'ONE_DETAIL'
  },
  [ISSUE_TYPES.LEXICAL_RETRIEVAL]: {
    primaryIssue: ISSUE_TYPES.LEXICAL_RETRIEVAL,
    confidence: 0.86,
    evidenceText: '就是那种……比较舒服，但又不是特别安静……',
    interventionType: 'SEMANTIC_CONTRAST'
  },
  [ISSUE_TYPES.INFORMATION_ORDER]: {
    primaryIssue: ISSUE_TYPES.INFORMATION_ORDER,
    confidence: 0.82,
    evidenceText: '环境很好，然后离学校也近，价格其实也不贵……',
    interventionType: 'CHOOSE_FIRST_MESSAGE'
  },
  [ISSUE_TYPES.CONTENT_START]: {
    primaryIssue: ISSUE_TYPES.CONTENT_START,
    confidence: 0.78,
    evidenceText: '这个问题……我一下不知道说什么。',
    interventionType: 'NARROW_SCOPE'
  },
  [ISSUE_TYPES.UNCERTAIN]: {
    primaryIssue: ISSUE_TYPES.UNCERTAIN,
    confidence: 0.42,
    evidenceText: '',
    interventionType: 'OBSERVE_AGAIN'
  }
};

const demoOrder = [
  ISSUE_TYPES.CONTENT_EXPAND,
  ISSUE_TYPES.LEXICAL_RETRIEVAL,
  ISSUE_TYPES.INFORMATION_ORDER,
  ISSUE_TYPES.CONTENT_START,
  ISSUE_TYPES.UNCERTAIN
];

function getDiagnosis(mode) {
  return Object.assign({}, diagnoses[mode] || diagnoses[ISSUE_TYPES.CONTENT_EXPAND]);
}

module.exports = {
  ENABLE_DEBUG_ENTRY,
  diagnoses,
  demoOrder,
  getDiagnosis
};
