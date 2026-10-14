const EXPERIENCE = {
  id: 'q_eval_experience',
  text: '最近有没有一个你原来觉得不太好用，后来用了发现还不错的东西？',
  taskType: 'EXPERIENCE_COMPARE',
  requiredSlots: ['object', 'expectation_before', 'experience_after'],
  openness: 'MEDIUM'
};

const APP_EXPERIENCE = {
  id: 'q_eval_app',
  text: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
  taskType: 'EXPERIENCE_COMPARE',
  requiredSlots: ['object', 'expectation_before', 'experience_after'],
  openness: 'MEDIUM'
};

const APP_DIFFERENCE = {
  id: 'q_eval_app_difference',
  text: '有没有一个常用 App，你和朋友对它评价正好不一样？',
  taskType: 'OPINION_DIFFERENCE',
  requiredSlots: ['topic', 'my_view', 'other_view', 'difference'],
  openness: 'MEDIUM'
};

const REASON = {
  id: 'q_eval_reason',
  text: '为什么你喜欢这个地方？',
  taskType: 'REASON_EXPLAIN',
  requiredSlots: ['object', 'attitude', 'reason'],
  openness: 'MEDIUM'
};

const CHOICE = {
  id: 'q_eval_choice',
  text: '短距离出门，你更愿意走路还是骑车？为什么？',
  taskType: 'CHOICE_REASON',
  requiredSlots: ['choice', 'reason'],
  openness: 'LOW'
};

const SIMPLE = {
  id: 'q_eval_simple',
  text: '说说最近一次让你印象比较深的小事。',
  taskType: 'SIMPLE_EXPERIENCE',
  requiredSlots: ['event', 'key_detail', 'result_or_feeling'],
  openness: 'HIGH'
};

function diagnosisOutput(issue, options) {
  const source = options || {};
  return {
    question_applicable: source.questionApplicable !== false,
    needs_intervention: source.needsIntervention !== false,
    primary_issue: issue,
    confidence: source.confidence || 0.82,
    evidence: source.evidence || [],
    question_factor: source.questionFactor || 'NONE',
    recommended_intervention: source.recommendedIntervention || null
  };
}

function diagnosisCase(id, description, question, transcript, modelOutput, expected, tags) {
  return {
    id,
    description,
    stage: 'diagnosis',
    question,
    transcript,
    signals: {},
    previousSlotState: {},
    modelOutput,
    expected,
    tags: tags || []
  };
}

function interventionCase(id, description, config, expected, tags) {
  return {
    id,
    description,
    stage: 'intervention',
    question: config.question,
    transcript: config.transcript,
    signals: {},
    previousSlotState: config.previousSlotState || {},
    intervention: {
      type: config.type,
      phase: config.phase || 'COMPLETE_INTERVENTION',
      beforeTranscript: config.beforeTranscript,
      targetSlot: config.targetSlot || '',
      currentPrompt: config.currentPrompt || '',
      anchor: config.anchor || ''
    },
    checkerOutput: config.checkerOutput,
    expected,
    tags: tags || []
  };
}

const cases = [
  diagnosisCase('E01_complete_experience', '完整体验对比回答不应强行干预', EXPERIENCE,
    '电瓶车吧，我原来觉得挺难骑的，实际骑了以后发现挺方便的。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '挺方便的', type: 'abstract' }] }),
    { questionApplicable: true, needsIntervention: false, primaryIssue: null, missingRequiredSlots: [] },
    ['CONTENT_EXPAND_NEGATIVE', 'UNCERTAIN_NEGATIVE']),

  diagnosisCase('E02_object_and_current_feeling', '对象与实际感受齐全但缺原预期', EXPERIENCE,
    '电瓶车吧，感觉挺好的。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '感觉挺好的', type: 'abstract' }] }),
    { questionApplicable: true, needsIntervention: true, primaryIssue: 'CONTENT_EXPAND', recommendedIntervention: 'ONE_DETAIL', missingRequiredSlots: ['expectation_before'] },
    ['CONTENT_EXPAND_POSITIVE', 'CONTENT_START_NEGATIVE']),

  diagnosisCase('E03_cannot_start', '没有对象且不知道说什么属于启动困难', EXPERIENCE,
    '嗯，不知道说什么。',
    diagnosisOutput('CONTENT_START', { evidence: [{ text: '不知道说什么', type: 'start_hesitation' }] }),
    { questionApplicable: true, needsIntervention: true, primaryIssue: 'CONTENT_START', recommendedIntervention: 'NARROW_SCOPE' },
    ['CONTENT_START_POSITIVE']),

  diagnosisCase('E04_not_applicable_difference', '明确没有分歧应判题目不适用', APP_DIFFERENCE,
    '最近没有，我和朋友没什么分歧。',
    diagnosisOutput('CONTENT_START', { evidence: [{ text: '最近没有', type: 'start' }] }),
    { questionApplicable: false, needsIntervention: false, primaryIssue: null },
    ['NOT_APPLICABLE', 'CONTENT_START_NEGATIVE']),

  diagnosisCase('E05_lexical_context', '有明确怎么说和怎么形容的找词行为', REASON,
    '我觉得找工作还是要在意工作的那些，嗯，怎么说，工作的那些，呃，怎么形容。',
    diagnosisOutput('LEXICAL_RETRIEVAL', { evidence: [{ text: '怎么说', type: 'explicit_lexical_search' }] }),
    { questionApplicable: true, needsIntervention: true, primaryIssue: 'LEXICAL_RETRIEVAL', recommendedIntervention: 'SEMANTIC_CONTRAST', lexicalMarkersInclude: ['怎么说', '怎么形容'] },
    ['LEXICAL_RETRIEVAL_POSITIVE']),

  diagnosisCase('E06_explicit_lexical_marker', '那个词怎么说必须命中找词', REASON,
    '那个词怎么说，就是他的想法很……',
    diagnosisOutput('LEXICAL_RETRIEVAL', { evidence: [{ text: '那个词怎么说', type: 'explicit_lexical_search' }] }),
    { primaryIssue: 'LEXICAL_RETRIEVAL', recommendedIntervention: 'SEMANTIC_CONTRAST', lexicalMarkersInclude: ['那个词怎么说'] },
    ['LEXICAL_RETRIEVAL_POSITIVE']),

  interventionCase('E07_find_object', 'FIND_OBJECT 只完成缩小范围，不完成原题', APP_EXPERIENCE, {}, []),
  interventionCase('E08_unknown_preserves_object', '无效回答不能清空历史 object', APP_EXPERIENCE, {}, []),
  interventionCase('E09_fill_expectation', '定向回答补充 expectation_before', APP_EXPERIENCE, {}, []),
  interventionCase('E10_grounding_asr_error', 'ASR 破碎时禁止模型脑补 experience_after', APP_EXPERIENCE, {}, []),
  interventionCase('E11_grounded_experience', '明确实际体验可完成最后一个 slot', APP_EXPERIENCE, {}, []),

  diagnosisCase('E12_fillers_only', '只有 filler 和思考不能判 CONTENT_EXPAND', EXPERIENCE,
    '嗯……呃……我想一下。',
    diagnosisOutput('CONTENT_START', { evidence: [{ text: '我想一下', type: 'start_hesitation' }] }),
    { primaryIssue: 'CONTENT_START', recommendedIntervention: 'NARROW_SCOPE' },
    ['CONTENT_START_POSITIVE', 'CONTENT_EXPAND_NEGATIVE']),

  interventionCase('E13_semantic_contrast_valid', '词不精确但替代描述完整可 PASS', REASON, {}, []),

  diagnosisCase('E14_short_complete_choice', '回答短但 choice 与 reason 完整', CHOICE,
    '我会骑车，因为快一点。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '快一点', type: 'short' }] }),
    { needsIntervention: false, primaryIssue: null, missingRequiredSlots: [] },
    ['CONTENT_EXPAND_NEGATIVE']),

  diagnosisCase('E15_information_order_positive', '多次中断切换导致主旨不明', SIMPLE,
    '我先说工作，不对，还是先说昨天，然后那个朋友，算了先说结果，我又想到另一件事。',
    diagnosisOutput('INFORMATION_ORDER', { evidence: [{ text: '不对，还是先说昨天', type: 'topic_switch' }] }),
    { needsIntervention: true, primaryIssue: 'INFORMATION_ORDER', recommendedIntervention: 'CHOOSE_FIRST_MESSAGE' },
    ['INFORMATION_ORDER_POSITIVE']),

  diagnosisCase('E16_reason_missing', '对象和态度有了但缺核心原因', REASON,
    '这个地方我很喜欢，真的挺好的。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '挺好的', type: 'unsupported_judgment' }] }),
    { primaryIssue: 'CONTENT_EXPAND', missingRequiredSlots: ['reason'] },
    ['CONTENT_EXPAND_POSITIVE']),

  diagnosisCase('E17_not_applicable_experience', '明确没经历过不是启动困难', EXPERIENCE,
    '这个我没经历过。',
    diagnosisOutput('CONTENT_START', { evidence: [{ text: '没经历过', type: 'start' }] }),
    { questionApplicable: false, needsIntervention: false, primaryIssue: null },
    ['NOT_APPLICABLE', 'CONTENT_START_NEGATIVE']),

  diagnosisCase('E18_lexical_false_positive', '怎么说都可以不是找词 marker', REASON,
    '怎么说都可以，我觉得这家店挺好。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '挺好', type: 'unsupported_judgment' }] }),
    { primaryIssue: 'CONTENT_EXPAND', lexicalMarkersExclude: ['怎么说'] },
    ['LEXICAL_RETRIEVAL_NEGATIVE', 'CONTENT_EXPAND_POSITIVE']),

  diagnosisCase('E19_normal_then_repetition', '普通口语重复然后不等于信息排序困难', SIMPLE,
    '昨天我去取快递，然后排了一会儿队，然后拿到以后就回家了，感觉挺顺利。',
    diagnosisOutput(null, { needsIntervention: false, evidence: [] }),
    { needsIntervention: false, primaryIssue: null },
    ['INFORMATION_ORDER_NEGATIVE']),

  diagnosisCase('E20_many_fillers_complete', 'filler 多但 requiredSlots 完整不干预', EXPERIENCE,
    '嗯，电瓶车吧，呃，我原来觉得难骑，那个，实际骑了以后发现挺方便。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '挺方便', type: 'abstract' }] }),
    { needsIntervention: false, primaryIssue: null, missingRequiredSlots: [] },
    ['CONTENT_EXPAND_NEGATIVE']),

  diagnosisCase('E21_pauses_but_complete', '停顿多但原题完整不干预', CHOICE,
    '我会……骑车，因为……会快一点。',
    diagnosisOutput('CONTENT_START', { evidence: [{ text: '会……骑车', type: 'pause' }] }),
    { needsIntervention: false, primaryIssue: null, missingRequiredSlots: [] },
    ['CONTENT_START_NEGATIVE']),

  diagnosisCase('E22_long_but_incomplete', '回答较长仍缺 required reason', REASON,
    '我很喜欢这个地方，我每周都会经过这里，也去过很多次，有时候还会停下来看看。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '很喜欢这个地方', type: 'unsupported_judgment' }] }),
    { primaryIssue: 'CONTENT_EXPAND', missingRequiredSlots: ['reason'] },
    ['CONTENT_EXPAND_POSITIVE']),

  diagnosisCase('E23_lexical_over_expand', '明确找词优先于内容展开', REASON,
    '我喜欢这里，因为它很……那个词怎么说……',
    diagnosisOutput('LEXICAL_RETRIEVAL', { evidence: [{ text: '那个词怎么说', type: 'explicit_lexical_search' }] }),
    { primaryIssue: 'LEXICAL_RETRIEVAL', recommendedIntervention: 'SEMANTIC_CONTRAST' },
    ['LEXICAL_RETRIEVAL_POSITIVE', 'CONTENT_EXPAND_NEGATIVE']),

  diagnosisCase('E24_uncertain_open_question', '开放题只有犹豫信号时保持 UNCERTAIN', SIMPLE,
    '嗯，我想一想，呃，嗯。',
    diagnosisOutput('UNCERTAIN', { evidence: [], questionFactor: 'TOO_OPEN' }),
    { primaryIssue: 'UNCERTAIN', recommendedIntervention: 'OBSERVE_AGAIN' },
    ['UNCERTAIN_POSITIVE']),

  diagnosisCase('E25_information_order_second_positive', '明确自我打断并持续换主线', REASON,
    '先说价格，不对我先说环境，等一下还是服务，刚才价格那个也很重要，我不知道先说哪个。',
    diagnosisOutput('INFORMATION_ORDER', { evidence: [{ text: '我不知道先说哪个', type: 'order_block' }] }),
    { primaryIssue: 'INFORMATION_ORDER', recommendedIntervention: 'CHOOSE_FIRST_MESSAGE' },
    ['INFORMATION_ORDER_POSITIVE']),

  diagnosisCase('E26_content_start_object_absent', '暂时想不到但未否定经历仍是启动困难', APP_EXPERIENCE,
    '一下想不到从哪个说。',
    diagnosisOutput(null, { questionApplicable: false, needsIntervention: false }),
    { questionApplicable: true, needsIntervention: true, primaryIssue: 'CONTENT_START' },
    ['CONTENT_START_POSITIVE', 'NOT_APPLICABLE_NEGATIVE']),

  diagnosisCase('E27_expand_minimal_reason', '因为挺好的缺少核心原因', REASON,
    '这个地方我喜欢，因为挺好的。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '因为挺好的', type: 'generic_reason' }] }),
    { primaryIssue: 'CONTENT_EXPAND', missingRequiredSlots: ['reason'] },
    ['CONTENT_EXPAND_POSITIVE']),

  diagnosisCase('E28_lexical_called_what', '叫什么来着属于明确找词', REASON,
    '这里有一种感觉，叫什么来着，我一时想不起来。',
    diagnosisOutput('LEXICAL_RETRIEVAL', { evidence: [{ text: '叫什么来着', type: 'explicit_lexical_search' }] }),
    { primaryIssue: 'LEXICAL_RETRIEVAL', lexicalMarkersInclude: ['叫什么来着', '想不起来'] },
    ['LEXICAL_RETRIEVAL_POSITIVE']),

  diagnosisCase('E29_uncertain_asr', 'ASR 内容无法可靠解释时保持 UNCERTAIN', EXPERIENCE,
    '其实那个还是有很多……别人的精英。',
    diagnosisOutput('UNCERTAIN', { evidence: [], questionFactor: 'ASR_UNCERTAIN' }),
    { primaryIssue: 'UNCERTAIN', recommendedIntervention: 'OBSERVE_AGAIN' },
    ['UNCERTAIN_POSITIVE']),

  diagnosisCase('E30_information_order_negative_choice', '两条并列理由不等于信息排序困难', CHOICE,
    '我会骑车，因为更快，而且不用等车。',
    diagnosisOutput(null, { needsIntervention: false }),
    { needsIntervention: false, primaryIssue: null },
    ['INFORMATION_ORDER_NEGATIVE']),

  diagnosisCase('E31_not_applicable_no_app', '明确没用过这种 App 应判不适用', APP_EXPERIENCE,
    '我没有用过这种 App。',
    diagnosisOutput('CONTENT_START', { evidence: [{ text: '没有用过', type: 'start' }] }),
    { questionApplicable: false, needsIntervention: false, primaryIssue: null },
    ['NOT_APPLICABLE']),

  diagnosisCase('E32_temporary_unknown', '想不出来不能直接判题目不适用', EXPERIENCE,
    '想不出来。',
    diagnosisOutput(null, { questionApplicable: false, needsIntervention: false }),
    { questionApplicable: true, needsIntervention: true, primaryIssue: 'CONTENT_START' },
    ['CONTENT_START_POSITIVE', 'NOT_APPLICABLE_NEGATIVE']),

  diagnosisCase('E33_short_reason_complete', '简短态度加原因满足 REASON_EXPLAIN', REASON,
    '这家店我喜欢，因为服务快。',
    diagnosisOutput('CONTENT_EXPAND', { evidence: [{ text: '服务快', type: 'short' }] }),
    { needsIntervention: false, primaryIssue: null, missingRequiredSlots: [] },
    ['CONTENT_EXPAND_NEGATIVE']),

  interventionCase('E34_choose_first_message', '确定第一条信息即可完成排序干预', SIMPLE, {}, []),
  interventionCase('E35_one_detail_grounded', 'ONE_DETAIL 只能用本轮原文填目标 slot', REASON, {}, [])
];

function replaceIntervention(id, config, expected, tags) {
  const index = cases.findIndex((item) => item.id === id);
  cases[index] = interventionCase(id, cases[index].description, config, expected, tags);
}

replaceIntervention('E07_find_object', {
  question: APP_EXPERIENCE,
  transcript: '小红书吧。',
  beforeTranscript: '嗯，不知道说什么。',
  previousSlotState: {},
  type: 'NARROW_SCOPE', phase: 'FIND_OBJECT', targetSlot: 'object',
  currentPrompt: '先说出一个具体对象。',
  checkerOutput: { result: 'PASS', reason: '找到对象', slot_evidence: { target_slot: 'object', filled: true, value: '小红书', evidence: '小红书' } }
}, { interventionPass: true, originalTaskComplete: false, missingRequiredSlots: ['expectation_before', 'experience_after'], filledSlots: { object: '小红书' } }, ['GROUNDING']);

replaceIntervention('E08_unknown_preserves_object', {
  question: APP_EXPERIENCE,
  transcript: '嗯，不知道。',
  beforeTranscript: '小红书吧。',
  previousSlotState: { object: { filled: true, value: '小红书', evidence: '小红书' } },
  type: 'ONE_DETAIL', targetSlot: 'expectation_before', currentPrompt: '你原来以为它会怎么样？',
  checkerOutput: { result: 'PASS', reason: '猜测为原预期' }
}, { interventionPass: false, originalTaskComplete: false, missingRequiredSlots: ['expectation_before', 'experience_after'], filledSlots: { object: '小红书' }, unfilledSlots: ['expectation_before'] }, ['GROUNDING', 'STATE_PRESERVATION']);

replaceIntervention('E09_fill_expectation', {
  question: APP_EXPERIENCE,
  transcript: '我原本以为它会有很多广告。',
  beforeTranscript: '小红书吧。',
  previousSlotState: { object: { filled: true, value: '小红书', evidence: '小红书' } },
  type: 'ONE_DETAIL', targetSlot: 'expectation_before', currentPrompt: '你原来以为它会怎么样？',
  checkerOutput: { result: 'PASS', reason: '原来认为广告很多', slot_evidence: { target_slot: 'expectation_before', filled: true, value: '认为广告很多', evidence: '我原本以为它会有很多广告。' } }
}, { interventionPass: true, originalTaskComplete: false, missingRequiredSlots: ['experience_after'], filledSlots: { object: '小红书', expectation_before: '我原本以为它会有很多广告。' }, evidenceBySlot: { expectation_before: '我原本以为它会有很多广告。' } }, ['GROUNDING']);

replaceIntervention('E10_grounding_asr_error', {
  question: APP_EXPERIENCE,
  transcript: '但是发现其实还是有很多。别人的精英。',
  beforeTranscript: '小红书吧。我原本以为它会有很多广告。',
  previousSlotState: {
    object: { filled: true, value: '小红书', evidence: '小红书' },
    expectation_before: { filled: true, value: '我原本以为它会有很多广告。', evidence: '我原本以为它会有很多广告。' }
  },
  type: 'ONE_DETAIL', targetSlot: 'experience_after', currentPrompt: '真正体验以后有什么不一样？',
  checkerOutput: { result: 'PASS', reason: '发现广告其实还是很多', slot_evidence: { target_slot: 'experience_after', filled: true, value: '可以学到别人经验', evidence: '发现广告其实还是很多' } }
}, { interventionPass: false, originalTaskComplete: false, missingRequiredSlots: ['experience_after'], unfilledSlots: ['experience_after'], forbiddenFacts: ['广告其实还是很多', '可以学到别人经验'] }, ['GROUNDING', 'ASR_BROKEN']);

replaceIntervention('E11_grounded_experience', {
  question: APP_EXPERIENCE,
  transcript: '真正用了以后，发现评论区里其实有很多真实经验可以参考。',
  beforeTranscript: '小红书吧。我原本以为它会有很多广告。',
  previousSlotState: {
    object: { filled: true, value: '小红书', evidence: '小红书' },
    expectation_before: { filled: true, value: '我原本以为它会有很多广告。', evidence: '我原本以为它会有很多广告。' }
  },
  type: 'ONE_DETAIL', targetSlot: 'experience_after', currentPrompt: '真正体验以后有什么不一样？',
  checkerOutput: { result: 'PASS', reason: '实际体验有参考价值', slot_evidence: { target_slot: 'experience_after', filled: true, value: '评论区经验可参考', evidence: '真正用了以后，发现评论区里其实有很多真实经验可以参考。' } }
}, { interventionPass: true, originalTaskComplete: true, missingRequiredSlots: [], filledSlots: { experience_after: '真正用了以后，发现评论区里其实有很多真实经验可以参考。' } }, ['GROUNDING']);

replaceIntervention('E13_semantic_contrast_valid', {
  question: REASON,
  transcript: '就是比较大胆吧，想法很多，想得很多。',
  beforeTranscript: '他的想法很……那个词怎么说。',
  previousSlotState: {}, type: 'SEMANTIC_CONTRAST',
  checkerOutput: { result: 'PASS', reason: '已经用替代描述继续表达' }
}, { interventionPass: true }, ['LEXICAL_RETRIEVAL_INTERVENTION']);

replaceIntervention('E34_choose_first_message', {
  question: SIMPLE,
  transcript: '我最想先说昨天坐过站这件事。',
  beforeTranscript: '我想到很多件事，不知道先说哪个。',
  previousSlotState: {}, type: 'CHOOSE_FIRST_MESSAGE',
  checkerOutput: { result: 'PASS', reason: '确定了第一条信息' }
}, { interventionPass: true }, ['INFORMATION_ORDER_INTERVENTION']);

replaceIntervention('E35_one_detail_grounded', {
  question: REASON,
  transcript: '因为服务员处理问题很快。',
  beforeTranscript: '这家店我很喜欢。',
  previousSlotState: {
    object: { filled: true, value: '这家店', evidence: '这家店' },
    attitude: { filled: true, value: '很喜欢', evidence: '很喜欢' }
  },
  type: 'ONE_DETAIL', targetSlot: 'reason', currentPrompt: '你为什么会这样想？',
  checkerOutput: { result: 'PASS', reason: '补充了原因', slot_evidence: { target_slot: 'reason', filled: true, value: '服务处理快', evidence: '因为服务员处理问题很快。' } }
}, { interventionPass: true, originalTaskComplete: true, missingRequiredSlots: [], filledSlots: { reason: '因为服务员处理问题很快。' } }, ['CONTENT_EXPAND_INTERVENTION', 'GROUNDING']);

module.exports = cases;
