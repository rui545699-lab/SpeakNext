const ISSUE_TYPES = [
  'CONTENT_START',
  'CONTENT_EXPAND',
  'LEXICAL_RETRIEVAL',
  'INFORMATION_ORDER',
  'UNCERTAIN'
];

const QUESTION_FACTORS = ['NONE', 'TOO_OPEN', 'ASR_UNCERTAIN', 'OTHER'];

const INTERVENTION_BY_ISSUE = Object.freeze({
  CONTENT_START: 'NARROW_SCOPE',
  CONTENT_EXPAND: 'ONE_DETAIL',
  LEXICAL_RETRIEVAL: 'SEMANTIC_CONTRAST',
  INFORMATION_ORDER: 'CHOOSE_FIRST_MESSAGE',
  UNCERTAIN: 'OBSERVE_AGAIN'
});

const LONG_PAUSE_THRESHOLD_MS = Number(process.env.LONG_PAUSE_THRESHOLD_MS || 1200);
const FILLERS = ['怎么说呢', '然后', '其实', '就是', '那个', '嗯', '呃', '额'];
const LEXICAL_MARKERS = [
  '那个词怎么说',
  '怎么形容',
  '叫什么来着',
  '怎么说来着',
  '那个什么',
  '一时想不起来',
  '想不起来',
  '想不起那个词',
  '那个词叫什么',
  '不知道用什么词'
];

module.exports = {
  ISSUE_TYPES,
  QUESTION_FACTORS,
  INTERVENTION_BY_ISSUE,
  LONG_PAUSE_THRESHOLD_MS,
  FILLERS,
  LEXICAL_MARKERS
};
