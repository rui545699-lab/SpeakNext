const assert = require('assert');
const {
  selectEvidenceForIssue,
  createContentExpandCopy,
  createEvidenceContext,
  createMissingSlotQuestion
} = require('../utils/diagnosis-copy');
const { createInsightCopy } = require('../utils/insight-copy');
const {
  extractTranscriptAnchor,
  createInterventionPlan,
  detectLexicalStrategy,
  createLexicalPrompt,
  getNarrowFallbackOptions,
  extractSpokenAnchor,
  createNarrowOriginalTaskPlan,
  createInitialSlotState
} = require('../utils/intervention-plan');

const diagnosis = {
  primaryIssue: 'CONTENT_EXPAND',
  questionFactor: 'NONE',
  interventionType: 'ONE_DETAIL',
  evidence: [
    { text: '嗯，我想一下', type: 'hesitation' },
    { text: '因为我觉得它比较方便', type: 'abstract_judgment' }
  ]
};
const transcript = '嗯，我想一下，因为我觉得它比较方便。';
assert.strictEqual(
  selectEvidenceForIssue(diagnosis, transcript).text,
  '因为我觉得它比较方便'
);
const expandCopy = createContentExpandCopy(diagnosis, transcript);
assert.strictEqual(expandCopy.evidenceText, '因为我觉得它比较方便');
assert.strictEqual(expandCopy.coreExpression, '方便');
assert.strictEqual(expandCopy.explanation, '这里还少一个具体场景、事实或例子。');
assert.strictEqual(expandCopy.followUpQuestion, '补一个具体场景、事实或例子。');

const q01 = {
  taskType: 'EXPERIENCE_COMPARE',
  requiredSlots: ['object', 'expectation_before', 'experience_after']
};
const initialObjectState = createInitialSlotState(q01, {
  missingRequiredSlots: ['expectation_before', 'experience_after']
}, '嗯，小红书吧。');
assert.deepStrictEqual(initialObjectState, {
  object: { filled: true, value: '小红书', evidence: '小红书' },
  expectation_before: { filled: false, value: '', evidence: '' },
  experience_after: { filled: false, value: '', evidence: '' }
});
const onlyObjectCopy = createContentExpandCopy({
  primaryIssue: 'CONTENT_EXPAND',
  missingRequiredSlots: ['expectation_before', 'experience_after'],
  slotState: initialObjectState
}, '嗯，小红书吧。', q01);
assert.strictEqual(
  onlyObjectCopy.explanation,
  '你已经说出了对象，还缺原来的预期和实际体验。'
);
assert.ok(!onlyObjectCopy.explanation.includes('现在的感受'));
const missingBefore = createContentExpandCopy(Object.assign({}, diagnosis, {
  missingRequiredSlots: ['expectation_before']
}), transcript, q01);
assert.strictEqual(missingBefore.followUpQuestion, '你原来以为它会怎么样？');
const missingAfter = createContentExpandCopy(Object.assign({}, diagnosis, {
  missingRequiredSlots: ['experience_after']
}), transcript, q01);
assert.strictEqual(missingAfter.followUpQuestion, '真正体验以后，哪一点和你原来想的不一样？');
assert.strictEqual(createMissingSlotQuestion({ missingRequiredSlots: ['reason'] }, {
  requiredSlots: ['object', 'attitude', 'reason']
}).question, '你为什么会这样想？');
assert.strictEqual(createMissingSlotQuestion({ missingRequiredSlots: ['other_view'] }, {
  requiredSlots: ['topic', 'my_view', 'other_view', 'difference']
}).question, '朋友或其他人是怎么看的？');

const lexicalContext = createEvidenceContext(
  '他的想法特别……那个词怎么说……但我知道不是保守。',
  '那个词怎么说'
);
assert.ok(lexicalContext.includes('他的想法特别'));
assert.ok(lexicalContext.includes('那个词怎么说'));

const expandInsight = createInsightCopy(diagnosis, transcript, {});
assert.strictEqual(expandInsight.lead, '这里还少了一块信息。');
assert.strictEqual(expandInsight.cta, '补一句');

const lexicalInsight = createInsightCopy({
  primaryIssue: 'LEXICAL_RETRIEVAL',
  interventionType: 'SEMANTIC_CONTRAST',
  evidenceText: '那个词怎么说',
  evidenceContext: lexicalContext
}, '他的想法特别……那个词怎么说……但我知道不是保守。', {});
assert.strictEqual(lexicalInsight.evidenceText, lexicalContext);

const startInsight = createInsightCopy({
  primaryIssue: 'CONTENT_START',
  questionFactor: 'NONE',
  interventionType: 'NARROW_SCOPE'
}, '我不知道从哪里开始', {});
assert.ok(startInsight.lead.includes('不太好想'));
assert.ok(!`${startInsight.lead}${startInsight.body}`.includes('题范围'));
assert.strictEqual(startInsight.factorNote, '');

const openStartInsight = createInsightCopy({
  primaryIssue: 'CONTENT_START',
  questionFactor: 'TOO_OPEN',
  interventionType: 'NARROW_SCOPE'
}, '我不知道从哪里开始', {});
assert.ok(openStartInsight.factorNote.includes('题本身比较开放'));

assert.deepStrictEqual(extractTranscriptAnchor('最近看了个电影'), {
  term: '电影',
  label: '这部电影'
});
assert.deepStrictEqual(extractTranscriptAnchor('买了一辆电瓶车'), {
  term: '电瓶车',
  label: '这辆电瓶车'
});
assert.deepStrictEqual(extractTranscriptAnchor('吃了一个火锅'), {
  term: '火锅',
  label: '这顿火锅'
});
const anchoredPlan = createInterventionPlan({
  transcript: '最近看了个电影',
  diagnosis: { interventionType: 'NARROW_SCOPE' },
  question: {
    category: 'CONTENT',
    text: '最近有没有一个东西，实际体验比你原来想象中更好？',
    taskType: 'EXPERIENCE_COMPARE'
  }
});
assert.strictEqual(anchoredPlan.fallbackRequired, false);
assert.ok(anchoredPlan.prompt.includes('这部电影'));
assert.ok(anchoredPlan.prompt.includes('比你原来想象中更好'));
assert.strictEqual(anchoredPlan.phase, 'ANSWER_ORIGINAL');
assert.ok(anchoredPlan.originalQuestion.includes('实际体验'));
assert.deepStrictEqual(anchoredPlan.options, []);

const fallbackPlan = createInterventionPlan({
  transcript: '嗯，我暂时没想到',
  diagnosis: { interventionType: 'NARROW_SCOPE' },
  question: { category: 'CONTENT' }
});
assert.strictEqual(fallbackPlan.fallbackRequired, true);
assert.strictEqual(fallbackPlan.phase, 'SELECT_OBJECT');
assert.deepStrictEqual(fallbackPlan.options, ['短视频', '电影 / 剧集', '书 / 文章', '其他内容']);

const appOptions = getNarrowFallbackOptions({
  category: 'APP_PRODUCT',
  taskType: 'OPINION_DIFFERENCE',
  text: '有没有一个常用 App，你和朋友对它的评价不太一样？'
});
assert.deepStrictEqual(appOptions, [
  '社交 / 内容 App', '购物 App', '地图 / 出行 App', '学习 / 工具 App'
]);
assert.ok(appOptions.every((item) => /App/.test(item)));
const appFallbackPlan = createInterventionPlan({
  transcript: '嗯，我一下子没想到从哪个说。',
  diagnosis: { interventionType: 'NARROW_SCOPE' },
  question: {
    category: 'APP_PRODUCT',
    taskType: 'OPINION_DIFFERENCE',
    text: '有没有一个常用 App，你和朋友对它的评价不太一样？'
  }
});
assert.strictEqual(appFallbackPlan.fallbackRequired, true);
assert.deepStrictEqual(appFallbackPlan.options, appOptions);
assert.deepStrictEqual(getNarrowFallbackOptions({
  category: 'CONTENT', text: '最近看过的一部电影或一部剧，你会不会推荐？'
}), ['电影', '电视剧 / 长剧', '短剧', '纪录片']);
assert.deepStrictEqual(getNarrowFallbackOptions({
  category: 'SHOPPING', text: '说说最近一次买东西的经历。'
}), ['日用品', '衣服 / 鞋包', '数码产品', '食品 / 饮料']);
assert.deepStrictEqual(getNarrowFallbackOptions({
  category: 'TRAVEL', text: '最近去过哪个地方？'
}), ['一个城市', '一个自然地点', '一个景点', '一个住宿地']);
assert.strictEqual(
  extractSpokenAnchor('嗯，手机里的 APP 吗？嗯，可能是小红书吧。'),
  '小红书'
);
const appOriginalPlan = createNarrowOriginalTaskPlan({
  taskType: 'OPINION_DIFFERENCE',
  originalQuestion: '有没有一个常用 App，你和朋友对它的评价不太一样？'
}, '嗯，手机里的 APP 吗？嗯，可能是小红书吧。');
assert.strictEqual(appOriginalPlan.anchor, '小红书');
assert.ok(appOriginalPlan.prompt.includes('小红书'));
assert.ok(appOriginalPlan.prompt.includes('朋友又怎么看'));
assert.ok(!appOriginalPlan.prompt.includes('手机里的 APP 吗'));

const umbrellaContext = '找工作还是要在意工作的那些……怎么说……就是薪资福利这些。';
assert.strictEqual(detectLexicalStrategy(umbrellaContext, 'explicit_lexical_search'), 'UMBRELLA');
assert.ok(createLexicalPrompt('UMBRELLA').includes('具体几项'));
const umbrellaPlan = createInterventionPlan({
  transcript: umbrellaContext,
  diagnosis: {
    interventionType: 'SEMANTIC_CONTRAST',
    evidenceText: '怎么说',
    evidenceContext: umbrellaContext,
    evidence: [{ text: '怎么说', type: 'explicit_lexical_search' }]
  },
  question: { text: '找工作时你最在意什么？' }
});
assert.strictEqual(umbrellaPlan.lexicalStrategy, 'UMBRELLA');
assert.ok(umbrellaPlan.prompt.includes('具体几项'));

const adjectiveContext = '他的想法很……那个词怎么形容。';
assert.strictEqual(detectLexicalStrategy(adjectiveContext, 'adjective_search'), 'ADJECTIVE');
assert.ok(createLexicalPrompt('ADJECTIVE').includes('什么感觉'));

console.log('diagnosis copy and intervention plan tests passed');
